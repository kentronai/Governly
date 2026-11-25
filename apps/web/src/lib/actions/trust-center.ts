"use server";

import { and, desc, eq, or } from "drizzle-orm";
import {
  db,
  tenants,
  trustCenterReports,
  trustCenterSettings,
  trustCenterTrainingPolicies,
  users,
} from "@db";
import { getCurrentUserServer } from "@/lib/utils/clerk.server";
import { createAuditEvent } from "@/lib/server/audit";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { loadReportData } from "@/lib/server/trust-center/data";
import { buildTrustCenterReport } from "@/lib/server/trust-center/pdf";
import {
  REPORT_LINK_DAYS,
  REPORT_SECTION_KEYS,
  type ReportOptions,
  type TrainingCategory,
  type TrustCenterSettings,
} from "@/lib/trust-center/report";

async function resolveTenant(tenantSlugOrId: string, requireAdmin = false) {
  const { userId, tenantId: orgId, isAdmin } = await getCurrentUserServer();
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(or(eq(tenants.id, tenantSlugOrId), eq(tenants.slug, tenantSlugOrId)))
    .limit(1);
  if (!tenant || tenant.id !== orgId) throw new Error("Tenant access denied");
  if (requireAdmin && !isAdmin) throw new Error("Only admins can do this");
  return { tenantId: tenant.id, userId, isAdmin };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cap = (v: unknown, n = 2000) => (typeof v === "string" ? v.slice(0, n) : "");

/** Settings, the latest training policy and the report's sub-processors (for the settings form). */
export async function getTrustCenterSettings(tenantSlugOrId: string) {
  const { tenantId, isAdmin } = await resolveTenant(tenantSlugOrId);
  const [[row], [policy], report] = await Promise.all([
    db.select().from(trustCenterSettings).where(eq(trustCenterSettings.tenantId, tenantId)).limit(1),
    db
      .select()
      .from(trustCenterTrainingPolicies)
      .where(eq(trustCenterTrainingPolicies.tenantId, tenantId))
      .orderBy(desc(trustCenterTrainingPolicies.createdAt))
      .limit(1),
    loadReportData(tenantId, { includePreviousSubprocessors: false }),
  ]);
  return {
    isAdmin,
    settings: (row?.data ?? {}) as TrustCenterSettings,
    trainingPolicy: policy ?? null,
    vendors: report.subprocessors.map((p) => ({ slug: p.key, name: p.name, source: p.source })),
  };
}

export async function saveTrustCenterSettings(tenantSlugOrId: string, settings: TrustCenterSettings) {
  const { tenantId, userId } = await resolveTenant(tenantSlugOrId, true);
  if (JSON.stringify(settings).length > 200_000) throw new Error("Settings are too large");
  await db
    .insert(trustCenterSettings)
    .values({ tenantId, data: settings, updatedBy: userId })
    .onConflictDoUpdate({
      target: trustCenterSettings.tenantId,
      set: { data: settings, updatedBy: userId, updatedAt: new Date().toISOString() },
    });
  await createAuditEvent({ tenantId, actorUserId: userId, action: "trust_center.settings.updated", targetType: "trust_center_settings", targetId: tenantId });
  return { success: true };
}

/** Publishes a new version of the customer data training policy (older versions are kept). */
export async function publishTrainingPolicy(
  tenantSlugOrId: string,
  input: { policyId: string; version: string; effectiveDate: string; owner: string; statement: string; categories: TrainingCategory[] },
) {
  const { tenantId, userId } = await resolveTenant(tenantSlugOrId, true);
  if (!input.policyId.trim() || !input.version.trim() || !input.owner.trim() || !DATE.test(input.effectiveDate))
    throw new Error("Policy ID, version, owner and effective date are required");
  const categories = (input.categories ?? [])
    .filter((c) => c.category?.trim())
    .slice(0, 50)
    .map((c) => ({ category: cap(c.category, 200), usedForTraining: cap(c.usedForTraining, 200), conditions: cap(c.conditions, 1000) }));
  const [row] = await db
    .insert(trustCenterTrainingPolicies)
    .values({
      tenantId,
      policyId: cap(input.policyId, 100),
      version: cap(input.version, 50),
      effectiveDate: input.effectiveDate,
      owner: cap(input.owner, 200),
      statement: cap(input.statement, 5000),
      categories,
      createdBy: userId,
    })
    .returning();
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "trust_center.training_policy.published",
    targetType: "trust_center_training_policy",
    targetId: row.id,
    metadata: { policyId: row.policyId, version: row.version },
  });
  return row;
}

/** Generates, stores (encrypted) and audits a report. Admin only. */
export async function generateTrustCenterReport(tenantSlugOrId: string, input: ReportOptions) {
  const { tenantId, userId } = await resolveTenant(tenantSlugOrId, true);
  const sections = REPORT_SECTION_KEYS.filter((k) => input.sections?.includes(k));
  if (!sections.length) throw new Error("Select at least one section");
  if (!DATE.test(input.periodStart) || !DATE.test(input.periodEnd) || input.periodStart > input.periodEnd)
    throw new Error("Invalid reporting period");
  const options: ReportOptions = {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sections,
    watermark: Boolean(input.watermark),
    includePreviousSubprocessors: Boolean(input.includePreviousSubprocessors),
  };
  const { reportId, pdf } = await buildTrustCenterReport(tenantId, options);
  const now = new Date();
  await db.insert(trustCenterReports).values({
    reportId,
    tenantId,
    generatedBy: userId,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    sections,
    options,
    fileEncrypted: encryptSecret(pdf.toString("base64")),
    fileSize: pdf.length,
    expiresAt: new Date(now.getTime() + REPORT_LINK_DAYS * 86_400_000).toISOString(),
  });
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "trust_center.report.generated",
    targetType: "trust_center_report",
    targetId: reportId,
    metadata: { reportId, periodStart: options.periodStart, periodEnd: options.periodEnd, sections, generatedAt: now.toISOString() },
  });
  return { reportId, filename: `${reportId}.pdf`, base64: pdf.toString("base64") };
}

/** Recent reports: admins see all, other members only shared ones. */
export async function listTrustCenterReports(tenantSlugOrId: string) {
  const { tenantId, isAdmin } = await resolveTenant(tenantSlugOrId);
  const rows = await db
    .select({
      reportId: trustCenterReports.reportId,
      periodStart: trustCenterReports.periodStart,
      periodEnd: trustCenterReports.periodEnd,
      sections: trustCenterReports.sections,
      shared: trustCenterReports.shared,
      createdAt: trustCenterReports.createdAt,
      expiresAt: trustCenterReports.expiresAt,
      fileSize: trustCenterReports.fileSize,
      generatedByEmail: users.email,
    })
    .from(trustCenterReports)
    .leftJoin(users, eq(users.id, trustCenterReports.generatedBy))
    .where(
      isAdmin
        ? eq(trustCenterReports.tenantId, tenantId)
        : and(eq(trustCenterReports.tenantId, tenantId), eq(trustCenterReports.shared, true)),
    )
    .orderBy(desc(trustCenterReports.createdAt))
    .limit(25);
  return { isAdmin, reports: rows };
}

export async function setTrustCenterReportShared(tenantSlugOrId: string, reportId: string, shared: boolean) {
  const { tenantId, userId } = await resolveTenant(tenantSlugOrId, true);
  await db
    .update(trustCenterReports)
    .set({ shared })
    .where(and(eq(trustCenterReports.tenantId, tenantId), eq(trustCenterReports.reportId, reportId)));
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: shared ? "trust_center.report.shared" : "trust_center.report.unshared",
    targetType: "trust_center_report",
    targetId: reportId,
  });
  return { shared };
}

/** Download while the 7-day link is valid; non-admins only for shared reports. */
export async function downloadTrustCenterReport(tenantSlugOrId: string, reportId: string) {
  const { tenantId, userId, isAdmin } = await resolveTenant(tenantSlugOrId);
  const [row] = await db
    .select()
    .from(trustCenterReports)
    .where(and(eq(trustCenterReports.tenantId, tenantId), eq(trustCenterReports.reportId, reportId)))
    .limit(1);
  if (!row || (!isAdmin && !row.shared)) throw new Error("Report not found");
  if (new Date(row.expiresAt) < new Date()) throw new Error("This report link has expired. Generate a new report.");
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "trust_center.report.downloaded",
    targetType: "trust_center_report",
    targetId: reportId,
  });
  return { filename: `${row.reportId}.pdf`, base64: decryptSecret(row.fileEncrypted) };
}

/** Whether the current user may generate reports (drives button visibility; actions re-check). */
export async function getTrustCenterAccess(tenantSlugOrId: string) {
  const { isAdmin } = await resolveTenant(tenantSlugOrId);
  return { isAdmin };
}
