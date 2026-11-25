import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  applicationModels,
  db,
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
import { getTrustDossierVendor } from "@/lib/trust-dossier/vendors";
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
  name: string;
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
        .where(and(eq(policyCenter.tenantId, tenantId), eq(policyCenter.isActive, true))),
      db.select({ slug: tenantFrameworks.slug }).from(tenantFrameworks).where(eq(tenantFrameworks.tenantId, tenantId)),
      db.select().from(trustDossierTracked).where(eq(trustDossierTracked.tenantId, tenantId)),
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
      hosting: `${SELF_HOSTED.has(m.provider) ? "Self-hosted" : "Third-party API"} (${provider}), ${region ?? "region not specified"}`,
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
  const frameworks = REPORT_FRAMEWORKS.map((fw) => {
    let progress: FrameworkProgress | null = null;
    const def = fw.tracker ? getFramework(fw.tracker) : undefined;
    if (def) {
      const rows = controls.filter((c) => c.framework === def.slug);
      const data = Object.fromEntries(rows.map((r) => [r.controlKey, r.data as Record<string, unknown>]));
      const keys = def.sections.flatMap((s) => s.requirements.flatMap(controlKeys));
      progress = {
        enabled: enabled.has(def.slug),
        total: keys.length,
        done: keys.filter((k) => isDone(data, k)).length,
        withEvidence: keys.filter((k) => str(data[k]?.evidence).trim()).length,
        lastUpdated: rows.map((r) => r.updatedAt).sort().at(-1) ?? null,
      };
    }
    return frameworkRow(fw, progress, settings.frameworks?.[fw.key]);
  });

  // Sub-processors: vendors tracked in Trust Dossier; overrides hold DPA status and data processed.
  const { active, previous } = splitSubprocessors(tracked, opts.includePreviousSubprocessors);
  const toRow = (t: (typeof tracked)[number]): SubprocessorRow => {
    const v = getTrustDossierVendor(t.vendorSlug);
    const o = settings.subprocessors?.[t.vendorSlug] ?? {};
    const locations = [...new Set((v?.subprocessors ?? []).flatMap((s) => s.location.split(/,\s*/)).filter(Boolean))];
    return {
      name: v?.company || v?.name || t.vendorSlug,
      service: orNotSpecified(o.service || v?.category),
      dataProcessed: orNotSpecified(o.dataProcessed),
      locations: orNotSpecified(o.locations || locations.slice(0, 4).join(", ")),
      dpa: orNotSpecified(o.dpaSigned),
      removedAt: t.removedAt,
    };
  };

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
    subprocessors: active.map(toRow).sort((a, b) => a.name.localeCompare(b.name)),
    previousSubprocessors: previous.map(toRow),
    settings,
  };
}
