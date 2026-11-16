"use server";

/** Fairness checks stored on a risk. Metrics are computed in the browser (src/lib/fairness.ts). */

import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { db, fairnessChecks, risks } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import type { FairnessResult } from "@/lib/fairness";
import { FOUR_FIFTHS } from "@/lib/fairness";

async function authorizedRisk(riskId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const [row] = await db
    .select({ id: risks.id })
    .from(risks)
    .where(and(eq(risks.id, riskId), eq(risks.tenantId, orgId)))
    .limit(1);
  if (!row) throw new Error("Risk not found");
  return { tenantId: orgId, userId };
}

export async function listFairnessChecks(riskId: string) {
  const { tenantId } = await authorizedRisk(riskId);
  const rows = await db
    .select()
    .from(fairnessChecks)
    .where(and(eq(fairnessChecks.tenantId, tenantId), eq(fairnessChecks.riskId, riskId)))
    .orderBy(desc(fairnessChecks.createdAt));
  return rows.map((r) => ({ ...r, result: r.result as FairnessResult }));
}

export async function saveFairnessCheck(input: {
  riskId: string;
  name: string;
  fileName: string;
  groupColumn: string;
  decisionColumn: string;
  positiveValue: string;
  labelColumn?: string;
  result: FairnessResult;
}) {
  const { tenantId, userId } = await authorizedRisk(input.riskId);
  const { result } = input;
  // Sanity-check the browser-computed summary before storing it.
  const ratios = result.groups?.map((g) => g.impactRatio) ?? [];
  if (
    !input.name.trim() ||
    ratios.length < 2 ||
    ratios.some((x) => !(x >= 0 && x <= 1)) ||
    Math.abs(Math.min(...ratios) - result.minImpactRatio) > 1e-9
  )
    throw new Error("Invalid fairness result");

  const [row] = await db
    .insert(fairnessChecks)
    .values({
      tenantId,
      riskId: input.riskId,
      name: input.name.trim(),
      fileName: input.fileName,
      groupColumn: input.groupColumn,
      decisionColumn: input.decisionColumn,
      positiveValue: input.positiveValue,
      labelColumn: input.labelColumn || null,
      result,
      // Recomputed here, not trusted from the client.
      passed: result.minImpactRatio >= FOUR_FIFTHS,
      createdBy: userId,
    })
    .returning({ id: fairnessChecks.id });

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "risk.fairness_check",
    targetType: "risk",
    targetId: input.riskId,
    metadata: { checkId: row.id, minImpactRatio: result.minImpactRatio },
  }).catch(() => undefined);
  return row;
}

export async function deleteFairnessCheck(id: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  await db
    .delete(fairnessChecks)
    .where(and(eq(fairnessChecks.id, id), eq(fairnessChecks.tenantId, orgId)));
}
