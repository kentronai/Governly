/**
 * AI Trust Center report: shared types and pure helpers (no DB, safe on the client).
 * Data is loaded in src/lib/server/trust-center/data.ts and rendered in pdf.ts.
 */

export const REPORT_SECTIONS = [
  { key: "models", title: "AI models in use" },
  { key: "training", title: "Customer data and model training" },
  { key: "frameworks", title: "Regulatory and standards alignment" },
  { key: "subprocessors", title: "Sub-processors" },
  { key: "governance", title: "Governance and contacts" },
] as const;
export type ReportSectionKey = (typeof REPORT_SECTIONS)[number]["key"];
export const REPORT_SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key) as ReportSectionKey[];

export const NOT_SPECIFIED = "Not specified";
export const NOT_APPLICABLE = "Not applicable";
export const REPORT_LINK_DAYS = 7;

export interface ReportOptions {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  sections: ReportSectionKey[];
  watermark: boolean;
  includePreviousSubprocessors: boolean;
}

export interface FrameworkOverride {
  scope?: string;
  status?: string;
  evidence?: string;
  lastAssessed?: string;
  notApplicableReason?: string;
}

export interface SubprocessorOverride {
  service?: string;
  dataProcessed?: string;
  locations?: string;
  dpaSigned?: string; // "Yes" | "No" | "In negotiation"
}

/** trust_center_settings.data */
export interface TrustCenterSettings {
  privacyContact?: string;
  securityContact?: string;
  aiGovernanceContact?: string;
  reviewCadence?: string;
  nextReview?: string;
  methodology?: string;
  frameworks?: Record<string, FrameworkOverride>;
  subprocessors?: Record<string, SubprocessorOverride>;
}

export interface TrainingCategory {
  category: string;
  usedForTraining: string;
  conditions: string;
}

/** The ten frameworks the report always lists; `tracker` is the Governly framework slug. */
export const REPORT_FRAMEWORKS = [
  { key: "nist-ai-rmf", name: "NIST AI RMF 1.0", tracker: "nist-ai-rmf", policy: "NIST AI Risk Management Framework", scope: "AI risk management (Govern, Map, Measure, Manage)" },
  { key: "iso-42001", name: "ISO/IEC 42001:2023", tracker: "iso-42001", policy: "ISO/IEC 42001", scope: "AI management system" },
  { key: "eu-ai-act", name: "EU AI Act (Reg. 2024/1689)", tracker: "eu-ai-act", policy: "EU AI Act", scope: "AI governance and risk tiers" },
  { key: "iso-27001", name: "ISO/IEC 27001:2022", tracker: "iso-27001", policy: "ISO/IEC 27001", scope: "Information security management" },
  { key: "soc-2-type-ii", name: "SOC 2 Type II", tracker: "soc-2-type-ii", policy: null, scope: "Security, availability, confidentiality" },
  { key: "nist-800-53", name: "NIST SP 800-53 Rev. 5", tracker: null, policy: null, scope: "Security and privacy controls" },
  { key: "gdpr", name: "GDPR", tracker: "gdpr", policy: "GDPR", scope: "EU data protection" },
  { key: "ccpa", name: "CCPA / CPRA", tracker: "ccpa", policy: "CCPA", scope: "California consumer privacy" },
  { key: "pci-dss", name: "PCI DSS v4.0", tracker: "pci-dss-lite", policy: "PCI DSS Lite", scope: "Payment card data" },
  { key: "hipaa", name: "HIPAA", tracker: "hipaa-security", policy: "HIPAA Security Rule", scope: "Protected health information" },
] as const;

export interface FrameworkProgress {
  enabled: boolean;
  total: number;
  done: number;
  withEvidence: number;
  lastUpdated: string | null;
  /** Applications assessed against this framework (Policy Center evaluations). */
  assessedApps?: number;
  /** Mean latest coverage score (0-100) across those applications. */
  avgCoverage?: number | null;
}

export interface FrameworkRow {
  name: string;
  scope: string;
  status: string;
  evidence: string;
  lastAssessed: string;
}

export const fmtDate = (iso: string | null | undefined, style: "long" | "short" = "long") => {
  if (!iso) return NOT_SPECIFIED;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const blank = (v: string | null | undefined) => !v || !v.trim();
export const orNotSpecified = (v: string | null | undefined) => (blank(v) ? NOT_SPECIFIED : v!.trim());

/**
 * One framework row. Admin overrides win; otherwise status comes from the Governly
 * tracker. A framework that is not enabled is "Not applicable" with a reason, never blank.
 */
export function frameworkRow(
  fw: { name: string; scope: string },
  progress: FrameworkProgress | null,
  override: FrameworkOverride = {},
): FrameworkRow {
  const scope = blank(override.scope) ? fw.scope : override.scope!.trim();
  const reason = blank(override.notApplicableReason)
    ? "Not in scope: no assessment or enabled tracker in Governly"
    : override.notApplicableReason!.trim();
  const apps = progress?.assessedApps ?? 0;
  const tracked = !!progress && (progress.done > 0 || progress.withEvidence > 0);
  const inScope = !!progress && (progress.enabled || apps > 0 || tracked);
  let status = override.status?.trim() || "";
  if (!status) {
    if (!inScope) status = NOT_APPLICABLE;
    else if (progress.total && progress.done >= progress.total) status = "Aligned";
    else if (apps && progress.avgCoverage != null) status = progress.avgCoverage >= 100 ? "Aligned" : progress.avgCoverage < 1 ? "Not yet aligned (0% coverage)" : `Partially aligned (${Math.round(progress.avgCoverage)}% coverage)`;
    else if (progress.done > 0 && progress.total) status = `In progress (${Math.round((progress.done / progress.total) * 100)}%)`;
    else status = "In progress";
  }
  const na = status === NOT_APPLICABLE;
  const parts: string[] = [];
  if (apps) parts.push(`Assessed across ${apps} application${apps === 1 ? "" : "s"}`);
  if (progress?.total && (progress.enabled || tracked))
    parts.push(`${progress.withEvidence} of ${progress.total} controls evidenced`);
  const evidence = !blank(override.evidence)
    ? override.evidence!.trim()
    : na
      ? reason
      : parts.join("; ") || "Assessment recorded in Governly";
  const lastAssessed = !blank(override.lastAssessed)
    ? fmtDate(override.lastAssessed, "short")
    : progress?.lastUpdated
      ? fmtDate(progress.lastUpdated, "short")
      : na ? "—" : "Not assessed";
  return { name: fw.name, scope, status, evidence, lastAssessed };
}

export interface TrackedVendorRow {
  removedAt: string | null;
}

/** Active sub-processors vs previously used (removed) ones; the latter only when asked for. */
export function splitSubprocessors<T extends TrackedVendorRow>(rows: T[], includePrevious: boolean) {
  return {
    active: rows.filter((r) => !r.removedAt),
    previous: includePrevious ? rows.filter((r) => r.removedAt) : [],
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Calendar quarter q (1-4) of year as YYYY-MM-DD bounds (UTC). */
export function quarterRange(year: number, q: number) {
  return {
    start: iso(new Date(Date.UTC(year, (q - 1) * 3, 1))),
    end: iso(new Date(Date.UTC(year, q * 3, 0))),
  };
}

/** The last fully completed calendar quarter before `now`. */
export function lastFullQuarter(now = new Date()) {
  const current = Math.floor(now.getUTCMonth() / 3) + 1;
  const year = current === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const q = current === 1 ? 4 : current - 1;
  return { year, q, ...quarterRange(year, q) };
}

/** TCR-YYYYMMDD-XXXX */
export function newReportId(now = new Date(), rand = Math.random) {
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rand() * 32)],
  ).join("");
  return `TCR-${iso(now).replace(/-/g, "")}-${suffix}`;
}
