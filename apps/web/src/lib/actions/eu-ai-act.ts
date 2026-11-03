"use server";

import { auth } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { db, euAiActControls, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";

// Requirement keys ("1.1") hold owner/reviewer/approver/dueDate;
// subcontrol keys ("1.1.1") hold implementation/status/evidence/auditorFeedback/attachments.
export type EuAiActControlData = Record<string, unknown>;

const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;
const KEY_PATTERN = /^\d+\.\d+(\.\d+)?$/;

async function resolveAuthorizedTenant(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db.select().from(tenants).where(eq(tenants.id, slugOrId)).limit(1);
  if (!rows.length) rows = await db.select().from(tenants).where(eq(tenants.slug, slugOrId)).limit(1);
  if (!rows.length || rows[0].id !== orgId) throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

export async function getEuAiActControls(tenantSlugOrId: string): Promise<Record<string, EuAiActControlData>> {
  const { tenantId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const rows = await db.select().from(euAiActControls).where(eq(euAiActControls.tenantId, tenantId));
  return Object.fromEntries(rows.map((row) => [row.controlKey, row.data as EuAiActControlData]));
}

export async function saveEuAiActControls(tenantSlugOrId: string, entries: Record<string, EuAiActControlData>) {
  const { tenantId, userId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const keys = Object.keys(entries);
  if (!keys.length) return { success: true };
  if (!keys.every((key) => KEY_PATTERN.test(key))) throw new Error("Invalid control key");
  if (JSON.stringify(entries).length > MAX_PAYLOAD_BYTES) throw new Error("Attachments are too large (max 12 MB per save)");

  await db
    .insert(euAiActControls)
    .values(keys.map((controlKey) => ({ tenantId, controlKey, data: entries[controlKey], updatedBy: userId })))
    .onConflictDoUpdate({
      target: [euAiActControls.tenantId, euAiActControls.controlKey],
      set: { data: sql`excluded.data`, updatedBy: userId, updatedAt: sql`now()` },
    });

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "eu_ai_act.controls.updated",
    targetType: "eu_ai_act_control",
    targetId: keys[0],
    metadata: { keys },
  });

  return { success: true };
}
