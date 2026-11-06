"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, frameworkControls, tenantFrameworks, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { FRAMEWORK_SLUGS } from "@/lib/frameworks";
import { getCatalogFramework } from "@/lib/frameworks/catalog";
import { mirrorWrites } from "@/lib/frameworks/controls";

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

/** Saved answers of every framework, { slug: { key: data } } (one query). */
export async function getAllFrameworkControls(
  tenantSlugOrId: string,
): Promise<Record<string, Record<string, FrameworkControlData>>> {
  const { tenantId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const rows = await db
    .select()
    .from(frameworkControls)
    .where(eq(frameworkControls.tenantId, tenantId));
  const all: Record<string, Record<string, FrameworkControlData>> = {};
  for (const row of rows)
    (all[row.framework] ??= {})[row.controlKey] =
      row.data as FrameworkControlData;
  return all;
}

async function upsertEntries(
  tenantId: string,
  userId: string,
  framework: string,
  entries: Record<string, FrameworkControlData>,
) {
  const keys = Object.keys(entries);
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
}

/**
 * Controls that several frameworks ask for are linked (EQUIVALENT_CONTROLS):
 * saving one copies its details to every mapped framework, so they complete
 * together. Existing answers there are kept when the new value is empty.
 */
async function mirrorToMappedFrameworks(
  tenantId: string,
  userId: string,
  framework: string,
  entries: Record<string, FrameworkControlData>,
) {
  const mirrors = mirrorWrites(framework, entries);
  for (const [slug, writes] of Object.entries(mirrors)) {
    const existing = await db
      .select()
      .from(frameworkControls)
      .where(
        and(
          eq(frameworkControls.tenantId, tenantId),
          eq(frameworkControls.framework, slug),
          inArray(frameworkControls.controlKey, Object.keys(writes)),
        ),
      );
    const current = Object.fromEntries(
      existing.map((row) => [row.controlKey, row.data as FrameworkControlData]),
    );
    await upsertEntries(
      tenantId,
      userId,
      slug,
      Object.fromEntries(
        Object.entries(writes).map(([key, data]) => [
          key,
          { ...current[key], ...data },
        ]),
      ),
    );
  }
  return Object.keys(mirrors);
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

  await upsertEntries(tenantId, userId, framework, entries);
  const mirrored = await mirrorToMappedFrameworks(
    tenantId,
    userId,
    framework,
    entries,
  );

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "framework.controls.updated",
    targetType: "framework_control",
    targetId: `${framework}:${keys[0]}`,
    metadata: { framework, keys, mirrored },
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
