import "server-only";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  applicationModels,
  applicationPolicyCenter,
  complianceEvidence,
  db,
  integrations,
  euAiActAssessments,
  frameworkControls,
  policyCenter,
  providerModels,
  tenantFrameworks,
  tenants,
  trustCenterSettings,
  trustCenterTrainingPolicies,
  trustDossierTracked,
} from "@db";
import { enabledFrameworks, getFramework } from "@/lib/frameworks";
import { controlKeys, isDone, str } from "@/lib/frameworks/helpers";
import { getTrustDossierVendor, type TrustDossierVendor } from "@/lib/trust-dossier/vendors";
import {
  type FrameworkProgress,
  type FrameworkRow,
  frameworkRow,
  NOT_SPECIFIED,
  orNotSpecified,
  REPORT_FRAMEWORKS,
  type ReportOptions,
  splitSubprocessors,
  type TrainingCategory,
  type TrustCenterSettings,
} from "@/lib/trust-center/report";

export interface ModelRow {
  name: string;
  type: string;
  hosting: string;
  stage: "Production" | "Pilot" | "Retired";
  purpose: string;
  euTier: string;
}

export interface SubprocessorRow {
  /** Key for admin overrides in trust_center_settings.subprocessors. */
  key: string;
  name: string;
  /** How Governly found it: tracked in Trust Dossier, a Model Registry provider, or a connected integration. */
  source: string;
  service: string;
  dataProcessed: string;
  locations: string;
  dpa: string;
  removedAt?: string | null;
}

export interface ReportData {
  orgName: string;
  models: ModelRow[];
  training: {
    policyId: string;
    version: string;
    effectiveDate: string;
    owner: string;
    statement: string;
    categories: TrainingCategory[];
  } | null;
  frameworks: FrameworkRow[];
  subprocessors: SubprocessorRow[];
  previousSubprocessors: SubprocessorRow[];
  settings: TrustCenterSettings;
}

const TYPE_LABEL: Record<string, string> = {
  llm: "Large language model",
  "3rd_party": "Third-party model",
  "1st_party": "In-house model",
};
const SELF_HOSTED = new Set(["ollama", "huggingface", "custom"]);
const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", bedrock: "AWS Bedrock", groq: "Groq",
  vertex: "Google Vertex AI", ollama: "Ollama", azure_openai: "Azure OpenAI",
  huggingface: "Hugging Face", gemini: "Google Gemini", custom: "Custom endpoint",
  openrouter: "OpenRouter", mistral: "Mistral", xai: "xAI", deepseek: "DeepSeek",
};
/** Known vendors for derived sub-processors; `slug` links the Trust Dossier catalog entry. */
const KNOWN_VENDORS: Record<string, { name: string; slug?: string; service?: string; data?: string }> = {
  openai: { name: "OpenAI", slug: "chatgpt" },
  azure_openai: { name: "Microsoft (Azure OpenAI)" },
  anthropic: { name: "Anthropic", slug: "claude" },
  gemini: { name: "Google", slug: "gemini" },
  vertex: { name: "Google", slug: "gemini" },
  xai: { name: "xAI", slug: "grok" },
  deepseek: { name: "DeepSeek", slug: "deepseek" },
  mistral: { name: "Mistral AI", slug: "mistral-le-chat" },
  groq: { name: "Groq", slug: "groq" },
  cohere: { name: "Cohere", slug: "cohere" },
  bedrock: { name: "Amazon Web Services" },
  openrouter: { name: "OpenRouter" },
  aws: { name: "Amazon Web Services", service: "Cloud infrastructure", data: "AI workload and resource metadata" },
  azure: { name: "Microsoft Azure", service: "Cloud infrastructure", data: "AI workload and resource metadata" },
  googlecloud: { name: "Google Cloud", service: "Cloud infrastructure", data: "AI workload and resource metadata" },
  gcp: { name: "Google Cloud", service: "Cloud infrastructure", data: "AI workload and resource metadata" },
  github: { name: "GitHub", service: "Source code hosting", data: "Repository metadata and model references" },
  langsmith: { name: "LangChain (LangSmith)", slug: "langchain", service: "LLM observability", data: "Traces of prompts and model outputs" },
  databricksunitycatalog: { name: "Databricks", slug: "databricks", service: "Data and ML platform", data: "Model and catalog metadata" },
  databricks: { name: "Databricks", slug: "databricks", service: "Data and ML platform", data: "Model and catalog metadata" },
  crewai: { name: "crewAI", slug: "crewai", service: "Agent orchestration", data: "Agent configuration and run metadata" },
  slack: { name: "Slack", slug: "slack", service: "Collaboration", data: "Workspace and app metadata" },
};
const EU_TIER: Record<string, string> = {
  unacceptable: "Unacceptable (prohibited)",
  high: "High risk",
  limited: "Limited risk (transparency duties)",
  minimal: "Minimal risk",
};
const TIER_ORDER = ["unacceptable", "high", "limited", "minimal"];

const stageOf = (status: string): ModelRow["stage"] =>
  status === "available" ? "Production" : status === "preview" ? "Pilot" : "Retired";

export async function loadReportData(tenantId: string, opts: Pick<ReportOptions, "includePreviousSubprocessors">): Promise<ReportData> {
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  const [models, appModels, assessments, [settingsRow], [policy], controls, activePolicies, enabledSlugs, tracked] =
    await Promise.all([
      db.select().from(providerModels).where(eq(providerModels.tenantId, tenantId)),
      db
        .select({ applicationId: applicationModels.applicationId, model: applicationModels.model, hosting: applicationModels.hostingLocation })
        .from(applicationModels)
        .where(eq(applicationModels.tenantId, tenantId)),
      db
        .select({ applicationId: euAiActAssessments.applicationId, tier: euAiActAssessments.riskClassification })
        .from(euAiActAssessments)
        .where(eq(euAiActAssessments.tenantId, tenantId)),
      db.select().from(trustCenterSettings).where(eq(trustCenterSettings.tenantId, tenantId)).limit(1),
      db
        .select()
        .from(trustCenterTrainingPolicies)
        .where(eq(trustCenterTrainingPolicies.tenantId, tenantId))
        .orderBy(desc(trustCenterTrainingPolicies.createdAt))
        .limit(1),
      db
        .select()
        .from(frameworkControls)
        .where(
          and(
            eq(frameworkControls.tenantId, tenantId),
            inArray(frameworkControls.framework, REPORT_FRAMEWORKS.flatMap((f) => (f.tracker ? [f.tracker] : []))),
          ),
        ),
      db
        .select({ name: policyCenter.name })
        .from(policyCenter)
        .where(and(eq(policyCenter.tenantId, tenantId), eq(policyCenter.isActive, true))), // per-tenant activations
      db.select({ slug: tenantFrameworks.slug }).from(tenantFrameworks).where(eq(tenantFrameworks.tenantId, tenantId)),
      db.select().from(trustDossierTracked).where(eq(trustDossierTracked.tenantId, tenantId)),
    ]);
  const [appPolicies, evidence, conns] = await Promise.all([
    db
      .select({
        name: policyCenter.name,
        category: policyCenter.category,
        applicationId: applicationPolicyCenter.applicationId,
        coverage: applicationPolicyCenter.coverageScore,
        evaluatedAt: applicationPolicyCenter.evaluatedAt,
      })
      .from(applicationPolicyCenter)
      .innerJoin(policyCenter, sql`${policyCenter.id}::text = ${applicationPolicyCenter.policyId}`)
      .where(eq(applicationPolicyCenter.tenantId, tenantId)),
    db
      .select({ name: policyCenter.name, updatedAt: complianceEvidence.updatedAt })
      .from(complianceEvidence)
      .innerJoin(policyCenter, sql`${policyCenter.id}::text = ${complianceEvidence.policyId}`)
      .where(and(eq(complianceEvidence.tenantId, tenantId), eq(complianceEvidence.isActive, true))),
    db
      .select({ name: integrations.name, key: integrations.nangoProviderConfigKey })
      .from(integrations)
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.isEnabled, true),
          or(eq(integrations.isCredentialsAdded, true), isNotNull(integrations.nangoConnectionId)),
        ),
      ),
  ]);
  const settings = (settingsRow?.data ?? {}) as TrustCenterSettings;

  // Models: Model Registry rows, enriched with application hosting and the strictest EU AI Act tier.
  const tierByApp = new Map<string, string>();
  for (const a of assessments) {
    const prev = tierByApp.get(a.applicationId);
    if (!prev || TIER_ORDER.indexOf(a.tier) < TIER_ORDER.indexOf(prev)) tierByApp.set(a.applicationId, a.tier);
  }
  const modelRows: ModelRow[] = models.map((m) => {
    const uses = appModels.filter((u) => u.model && (u.model === m.modelId || u.model === m.displayName));
    const tiers = uses.map((u) => tierByApp.get(u.applicationId)).filter(Boolean) as string[];
    const tier = TIER_ORDER.find((t) => tiers.includes(t));
    const region = uses.map((u) => u.hosting).find((h) => h?.trim());
    const provider = PROVIDER_LABEL[m.provider] ?? m.provider;
    return {
      name: m.displayName || m.modelId,
      type: m.category ? TYPE_LABEL[m.category] : NOT_SPECIFIED,
      hosting: `${SELF_HOSTED.has(m.provider) ? "Self-hosted" : "Third-party API"} (${provider})${region ? `, ${region}` : ""}`,
      stage: stageOf(m.availabilityStatus),
      purpose: orNotSpecified(m.purposeUseCase),
      euTier: tier ? EU_TIER[tier] : "Not assessed",
    };
  });
  const stageRank = { Production: 0, Pilot: 1, Retired: 2 };
  modelRows.sort((a, b) => stageRank[a.stage] - stageRank[b.stage] || a.name.localeCompare(b.name));

  // Frameworks: Governly trackers (Admin Center > Regulations & Frameworks) + admin overrides.
  const enabled = new Set(
    enabledFrameworks(activePolicies.map((p) => p.name), enabledSlugs.map((r) => r.slug)).map((f) => f.slug),
  );
  // Policy Center evaluations: latest score per (policy, application).
  const latest = new Map<string, (typeof appPolicies)[number]>();
  for (const r of appPolicies) {
    const k = `${r.name}|${r.applicationId}`;
    const prev = latest.get(k);
    if (!prev || (r.evaluatedAt ?? "") > (prev.evaluatedAt ?? "")) latest.set(k, r);
  }
  const byPolicy = new Map<string, { apps: number; sum: number; scored: number; last: string | null; category: string | null }>();
  for (const r of latest.values()) {
    const e = byPolicy.get(r.name) ?? { apps: 0, sum: 0, scored: 0, last: null, category: r.category };
    e.apps++;
    if (r.coverage != null) (e.sum += Number(r.coverage)), e.scored++;
    if (r.evaluatedAt && (!e.last || r.evaluatedAt > e.last)) e.last = r.evaluatedAt;
    byPolicy.set(r.name, e);
  }
  const evidenceLast = new Map<string, string>();
  for (const e of evidence) if (e.updatedAt > (evidenceLast.get(e.name) ?? "")) evidenceLast.set(e.name, e.updatedAt);
  const newest = (...d: (string | null | undefined)[]) => (d.filter(Boolean) as string[]).sort().at(-1) ?? null;

  const frameworks = REPORT_FRAMEWORKS.map((fw) => {
    const def = fw.tracker ? getFramework(fw.tracker) : undefined;
    const pol = fw.policy ? byPolicy.get(fw.policy) : undefined;
    const rows = def ? controls.filter((c) => c.framework === def.slug) : [];
    const data = Object.fromEntries(rows.map((r) => [r.controlKey, r.data as Record<string, unknown>]));
    const keys = def ? def.sections.flatMap((s) => s.requirements.flatMap(controlKeys)) : [];
    const progress: FrameworkProgress | null =
      def || pol
        ? {
            enabled: !!def && enabled.has(def.slug),
            total: keys.length,
            done: keys.filter((k) => isDone(data, k)).length,
            withEvidence: keys.filter((k) => str(data[k]?.evidence).replace(/<[^>]*>/g, "").trim()).length,
            lastUpdated: newest(
              ...rows.filter((r) => Object.keys((r.data as object) ?? {}).length).map((r) => r.updatedAt),
              pol?.last,
              fw.policy ? evidenceLast.get(fw.policy) : null,
            ),
            assessedApps: pol?.apps ?? 0,
            avgCoverage: pol?.scored ? pol.sum / pol.scored : null,
          }
        : null;
    return frameworkRow(fw, progress, settings.frameworks?.[fw.key]);
  });
  // Other regulations the tenant has assessed applications against (not in the fixed ten).
  const fixed = new Set<string | null>(REPORT_FRAMEWORKS.map((f) => f.policy));
  for (const [name, p] of [...byPolicy].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (fixed.has(name)) continue;
    frameworks.push(
      frameworkRow(
        { name, scope: p.category || "AI regulation or guidance" },
        { enabled: false, total: 0, done: 0, withEvidence: 0, lastUpdated: newest(p.last, evidenceLast.get(name)), assessedApps: p.apps, avgCoverage: p.scored ? p.sum / p.scored : null },
      ),
    );
  }

  // Sub-processors: Trust Dossier tracked vendors, plus (derived automatically) the providers of
  // Model Registry models and connected integrations. Catalog data fills service/locations.
  const { active, previous } = splitSubprocessors(tracked, opts.includePreviousSubprocessors);
  const toRow = (key: string, source: string, base: { name?: string; service?: string; data?: string }, v?: TrustDossierVendor, removedAt?: string | null): SubprocessorRow => {
    const o = settings.subprocessors?.[key] ?? {};
    return {
      key,
      name: base.name || v?.company || v?.name || key,
      source,
      service: orNotSpecified(o.service || base.service || v?.category),
      dataProcessed: orNotSpecified(o.dataProcessed || base.data),
      // ponytail: catalog locations are the vendor's own sub-processors, not where it processes our data; admin sets this.
      locations: orNotSpecified(o.locations),
      dpa: orNotSpecified(o.dpaSigned),
      removedAt,
    };
  };
  const rowsByName = new Map<string, SubprocessorRow>();
  const add = (r: SubprocessorRow) => {
    const k = r.name.toLowerCase();
    const prev = rowsByName.get(k);
    if (prev) prev.source = [...new Set([...prev.source.split(", "), r.source])].join(", ");
    else rowsByName.set(k, r);
  };
  for (const t of active) add(toRow(t.vendorSlug, "Trust Dossier", {}, getTrustDossierVendor(t.vendorSlug)));
  for (const p of new Set(models.filter((m) => !SELF_HOSTED.has(m.provider)).map((m) => m.provider))) {
    const k = KNOWN_VENDORS[p];
    add(toRow(k?.slug ?? p, "Model Registry", { name: k?.name ?? PROVIDER_LABEL[p] ?? p, service: "AI model inference (API)", data: "Prompts and model outputs" }, k?.slug ? getTrustDossierVendor(k.slug) : undefined));
  }
  for (const c of conns) {
    const id = (c.key || c.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const k = KNOWN_VENDORS[id];
    add(toRow(k?.slug ?? id, "Integration", { name: k?.name ?? c.name, service: k?.service ?? "Connected integration", data: k?.data }, k?.slug ? getTrustDossierVendor(k.slug) : undefined));
  }

  return {
    orgName: tenant?.name ?? "Organization",
    models: modelRows,
    training: policy
      ? {
          policyId: policy.policyId,
          version: policy.version,
          effectiveDate: policy.effectiveDate,
          owner: policy.owner,
          statement: policy.statement,
          categories: policy.categories,
        }
      : null,
    frameworks,
    subprocessors: [...rowsByName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    previousSubprocessors: previous.map((t) => toRow(t.vendorSlug, "Trust Dossier", {}, getTrustDossierVendor(t.vendorSlug), t.removedAt)),
    settings,
  };
}
