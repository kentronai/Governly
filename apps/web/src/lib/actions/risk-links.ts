"use server";

/**
 * Links between a risk and the controls / policies that address it.
 * One table (risk_links) serves both directions: the risk register reads it by
 * risk, the control dialog reads it by control id.
 */

import { auth } from "@clerk/nextjs/server";
import { and, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, policyCenter, riskLinks, riskList, risks, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { describeControl } from "@/lib/frameworks/controls";

type TargetType = "control" | "policy";

export interface LinkedItem {
  linkId: string;
  targetType: TargetType;
  targetId: string;
  label: string;
  sublabel: string;
}

async function resolveAuthorizedTenant(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(or(eq(tenants.id, slugOrId), eq(tenants.slug, slugOrId)))
    .limit(1);
  if (!row || row.id !== orgId) throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

async function assertRiskInTenant(riskId: string, tenantId: string) {
  const [row] = await db
    .select({ id: risks.id })
    .from(risks)
    .where(and(eq(risks.id, riskId), eq(risks.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new Error("Risk not found");
}

/** Controls and policies linked to one risk, with display labels. */
export async function getRiskLinks(
  tenant: string,
  riskId: string,
): Promise<LinkedItem[]> {
  const { tenantId } = await resolveAuthorizedTenant(tenant);
  const rows = await db
    .select()
    .from(riskLinks)
    .where(and(eq(riskLinks.tenantId, tenantId), eq(riskLinks.riskId, riskId)));

  const policyIds = rows
    .filter((r) => r.targetType === "policy")
    .map((r) => r.targetId);
  const policies = policyIds.length
    ? await db
        .select({ id: policyCenter.id, name: policyCenter.name, category: policyCenter.category })
        .from(policyCenter)
        .where(inArray(policyCenter.id, policyIds))
    : [];

  return rows.map((r) => {
    if (r.targetType === "control") {
      const c = describeControl(r.targetId);
      return {
        linkId: r.id,
        targetType: "control",
        targetId: r.targetId,
        label: c ? `${c.code} ${c.title}` : r.targetId,
        sublabel: c?.framework ?? "Control no longer in the catalog",
      };
    }
    const p = policies.find((x) => x.id === r.targetId);
    return {
      linkId: r.id,
      targetType: "policy",
      targetId: r.targetId,
      label: p?.name ?? "Deleted policy",
      sublabel: p?.category ?? "",
    };
  });
}

/** Link counts per risk, for the register's Controls / Policies columns. */
export async function getRiskLinkCounts(
  tenant: string,
  riskIds: string[],
): Promise<Record<string, { control: number; policy: number }>> {
  const { tenantId } = await resolveAuthorizedTenant(tenant);
  if (!riskIds.length) return {};
  const rows = await db
    .select({
      riskId: riskLinks.riskId,
      targetType: riskLinks.targetType,
      n: sql<number>`count(*)::int`,
    })
    .from(riskLinks)
    .where(and(eq(riskLinks.tenantId, tenantId), inArray(riskLinks.riskId, riskIds)))
    .groupBy(riskLinks.riskId, riskLinks.targetType);
  const out: Record<string, { control: number; policy: number }> = {};
  for (const r of rows)
    (out[r.riskId] ??= { control: 0, policy: 0 })[r.targetType] = r.n;
  return out;
}

/** Risks linked to a control (the control dialog's "Linked risks"). */
export async function getRisksForControl(tenant: string, controlIds: string[]) {
  const { tenantId } = await resolveAuthorizedTenant(tenant);
  if (!controlIds.length) return [];
  return db
    .select({
      linkId: riskLinks.id,
      controlId: riskLinks.targetId,
      riskId: risks.id,
      riskName: risks.riskName,
      riskLevel: risks.riskLevel,
      applicationId: risks.applicationId,
    })
    .from(riskLinks)
    .innerJoin(risks, eq(risks.id, riskLinks.riskId))
    .where(
      and(
        eq(riskLinks.tenantId, tenantId),
        eq(riskLinks.targetType, "control"),
        inArray(riskLinks.targetId, controlIds),
      ),
    );
}

/** Every risk in the tenant, for the "Link risk" picker on a control. */
export async function getTenantRisks(tenant: string) {
  const { tenantId } = await resolveAuthorizedTenant(tenant);
  return db
    .select({ id: risks.id, riskName: risks.riskName, riskLevel: risks.riskLevel })
    .from(risks)
    .where(eq(risks.tenantId, tenantId))
    .orderBy(risks.riskName);
}

/** The tenant's active policies, for the "Link policy" picker. */
export async function getLinkablePolicies(tenant: string) {
  const { tenantId } = await resolveAuthorizedTenant(tenant);
  return db
    .select({ id: policyCenter.id, name: policyCenter.name, category: policyCenter.category })
    .from(policyCenter)
    .where(and(eq(policyCenter.tenantId, tenantId), eq(policyCenter.isActive, true)))
    .orderBy(policyCenter.name);
}

export async function linkRisk(
  tenant: string,
  riskId: string,
  targetType: TargetType,
  targetId: string,
) {
  const { tenantId, userId } = await resolveAuthorizedTenant(tenant);
  await assertRiskInTenant(riskId, tenantId);
  if (targetType === "control" && !describeControl(targetId))
    throw new Error("Unknown control");
  if (targetType === "policy") {
    const [p] = await db
      .select({ id: policyCenter.id })
      .from(policyCenter)
      .where(and(eq(policyCenter.id, targetId), eq(policyCenter.tenantId, tenantId)))
      .limit(1);
    if (!p) throw new Error("Unknown policy");
  }
  await db
    .insert(riskLinks)
    .values({ tenantId, riskId, targetType, targetId, createdBy: userId })
    .onConflictDoNothing();
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "risk.linked",
    targetType: "risk",
    targetId: riskId,
    metadata: { targetType, targetId },
  }).catch(() => undefined);
}

export async function unlinkRisk(tenant: string, linkId: string) {
  const { tenantId, userId } = await resolveAuthorizedTenant(tenant);
  const [row] = await db
    .delete(riskLinks)
    .where(and(eq(riskLinks.id, linkId), eq(riskLinks.tenantId, tenantId)))
    .returning();
  if (row)
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "risk.unlinked",
      targetType: "risk",
      targetId: row.riskId,
      metadata: { targetType: row.targetType, targetId: row.targetId },
    }).catch(() => undefined);
}

/** Search the IBM / MIT risk catalog (risk_list). Capped; narrow with the query. */
export async function searchRiskCatalog(source: "ibm" | "mit", query: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const q = `%${query.trim()}%`;
  return db
    .select({
      id: riskList.id,
      sourceId: riskList.sourceId,
      riskName: riskList.riskName,
      description: riskList.description,
      severity: riskList.severity,
      likelihood: riskList.likelihood,
      category: riskList.category,
      sourceRef: riskList.sourceRef,
    })
    .from(riskList)
    .where(
      and(
        eq(riskList.source, source),
        isNotNull(riskList.sourceId),
        query.trim()
          ? or(
              ilike(riskList.riskName, q),
              ilike(riskList.description, q),
              sql`array_to_string(${riskList.category}, ' ') ILIKE ${q}`,
            )
          : undefined,
      ),
    )
    .orderBy(riskList.riskName)
    .limit(200);
}

export async function countRiskCatalog(source: "ibm" | "mit") {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(riskList)
    .where(eq(riskList.source, source));
  return row?.n ?? 0;
}
