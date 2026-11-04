"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { db, frameworkControls, tenantFrameworks, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { FRAMEWORK_SLUGS } from "@/lib/frameworks";
import { getCatalogFramework } from "@/lib/frameworks/catalog";

// Requirement keys ("1.1") hold owner/reviewer/approver/dueDate;
// subcontrol keys ("1.1.1") hold implementation/status/evidence/auditorFeedback.
export type FrameworkControlData = Record<string, unknown>;

const MAX_PAYLOAD_BYTES = 12 * 1024 * 1024;
const KEY_PATTERN = /^\d+\.\d+(\.\d+)?$/;

async function resolveAuthorizedTenant(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, slugOrId))
    .limit(1);
  if (!rows.length)
    rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slugOrId))
      .limit(1);
  if (!rows.length || rows[0].id !== orgId)
    throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

function assertFramework(framework: string) {
  if (!FRAMEWORK_SLUGS.includes(framework))
    throw new Error("Unknown framework");
}

export async function getFrameworkControls(
  tenantSlugOrId: string,
  framework: string,
): Promise<Record<string, FrameworkControlData>> {
  assertFramework(framework);
  const { tenantId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const rows = await db
    .select()
    .from(frameworkControls)
    .where(
      and(
        eq(frameworkControls.tenantId, tenantId),
        eq(frameworkControls.framework, framework),
      ),
    );
  return Object.fromEntries(
    rows.map((row) => [row.controlKey, row.data as FrameworkControlData]),
  );
}

export async function saveFrameworkControls(
  tenantSlugOrId: string,
  framework: string,
  entries: Record<string, FrameworkControlData>,
) {
  assertFramework(framework);
  const { tenantId, userId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const keys = Object.keys(entries);
  if (!keys.length) return { success: true };
  if (!keys.every((key) => KEY_PATTERN.test(key)))
    throw new Error("Invalid control key");
  if (JSON.stringify(entries).length > MAX_PAYLOAD_BYTES)
    throw new Error("Attachments are too large (max 12 MB per save)");

  await db
    .insert(frameworkControls)
    .values(
      keys.map((controlKey) => ({
        tenantId,
        framework,
        controlKey,
        data: entries[controlKey],
        updatedBy: userId,
      })),
    )
    .onConflictDoUpdate({
      target: [
        frameworkControls.tenantId,
        frameworkControls.framework,
        frameworkControls.controlKey,
      ],
      set: {
        data: sql`excluded.data`,
        updatedBy: userId,
        updatedAt: sql`now()`,
      },
    });

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "framework.controls.updated",
    targetType: "framework_control",
    targetId: `${framework}:${keys[0]}`,
    metadata: { framework, keys },
  });

  return { success: true };
}

export async function getEnabledCatalogFrameworks(
  tenantSlugOrId: string,
): Promise<string[]> {
  const { tenantId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const rows = await db
    .select()
    .from(tenantFrameworks)
    .where(eq(tenantFrameworks.tenantId, tenantId));
  return rows.map((row) => row.slug);
}

export async function setCatalogFrameworkEnabled(
  tenantSlugOrId: string,
  slug: string,
  enabled: boolean,
) {
  if (!getCatalogFramework(slug)) throw new Error("Unknown framework");
  const { tenantId, userId } = await resolveAuthorizedTenant(tenantSlugOrId);
  if (enabled) {
    await db
      .insert(tenantFrameworks)
      .values({ tenantId, slug, enabledBy: userId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(tenantFrameworks)
      .where(
        and(
          eq(tenantFrameworks.tenantId, tenantId),
          eq(tenantFrameworks.slug, slug),
        ),
      );
  }
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: enabled ? "framework.enabled" : "framework.disabled",
    targetType: "framework",
    targetId: slug,
    metadata: { slug },
  });
  return { success: true };
}
