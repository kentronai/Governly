"use server";

import { auth } from "@clerk/nextjs/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  radarCoverage,
  radarRuns,
  radarUpdates,
  tenants,
} from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import {
  RADAR_INTERVAL_HOURS,
  RadarBusyError,
  startRadarRun,
} from "@/lib/server/radar/agent";

const ADMIN_ORG_ROLES = ["org:admin", "admin", "org:owner"];

async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
}

// Coverage and runs are platform-wide, so writes are limited to org admins.
async function resolveAdmin(slugOrId: string) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db.select().from(tenants).where(eq(tenants.id, slugOrId)).limit(1);
  if (!rows.length)
    rows = await db.select().from(tenants).where(eq(tenants.slug, slugOrId)).limit(1);
  if (!rows.length || rows[0].id !== orgId) throw new Error("Tenant access denied");
  if (!orgRole || !ADMIN_ORG_ROLES.includes(orgRole))
    throw new Error("Only admins can manage AI Radar");
  return { tenantId: orgId, userId };
}

/** Agent card: latest run, cadence, coverage and health. */
export async function getRadarStatus() {
  await requireUser();
  const [lastRun] = await db
    .select()
    .from(radarRuns)
    .orderBy(desc(radarRuns.startedAt))
    .limit(1);
  const [cov] = await db
    .select({
      total: sql<number>`count(*)`,
      enabled: sql<number>`count(*) filter (where ${radarCoverage.isEnabled})`,
      noSources: sql<number>`count(*) filter (where ${radarCoverage.isEnabled} and cardinality(${radarCoverage.primarySourceUrls}) = 0)`,
    })
    .from(radarCoverage);

  // A "running" row older than the run lock means the server died mid-run.
  const stale =
    lastRun?.status === "running" &&
    Date.now() - new Date(lastRun.startedAt).getTime() > 3 * 3_600_000;
  return {
    lastRun: lastRun
      ? { ...lastRun, status: stale ? "interrupted" : lastRun.status }
      : null,
    intervalHours: RADAR_INTERVAL_HOURS,
    coverage: {
      total: Number(cov.total),
      enabled: Number(cov.enabled),
      noSources: Number(cov.noSources),
    },
  };
}

export async function getRadarUpdates(limit = 100) {
  await requireUser();
  return db
    .select()
    .from(radarUpdates)
    .orderBy(desc(radarUpdates.detectedAt))
    .limit(Math.min(limit, 500));
}

export async function listRadarCoverage() {
  await requireUser();
  return db
    .select()
    .from(radarCoverage)
    .orderBy(radarCoverage.tier, radarCoverage.jurisdictionName);
}

const coverageInput = z.object({
  id: z.string().uuid().optional(),
  jurisdictionName: z.string().trim().min(2).max(120),
  tier: z.number().int().min(1).max(3),
  instrumentsTracked: z.string().trim().max(1000).optional(),
  primarySourceUrls: z
    .array(z.string().trim().url().refine((u) => /^https?:\/\//i.test(u)))
    .max(20),
  isEnabled: z.boolean(),
});

export async function saveRadarCoverage(
  tenantSlugOrId: string,
  input: z.input<typeof coverageInput>,
) {
  const { tenantId, userId } = await resolveAdmin(tenantSlugOrId);
  const { id, ...values } = coverageInput.parse(input);
  const row = { ...values, instrumentsTracked: values.instrumentsTracked || null };
  if (id) {
    await db.update(radarCoverage).set(row).where(eq(radarCoverage.id, id));
  } else {
    await db
      .insert(radarCoverage)
      .values(row)
      .onConflictDoUpdate({ target: radarCoverage.jurisdictionName, set: row });
  }
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "ai_radar.coverage_saved",
    targetType: "radar_coverage",
    targetId: row.jurisdictionName,
  });
  return { success: true };
}

export async function runRadarNow(tenantSlugOrId: string) {
  const { tenantId, userId } = await resolveAdmin(tenantSlugOrId);
  try {
    const { runId } = await startRadarRun({ trigger: "manual", tenantId, userId });
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "ai_radar.run_started",
      targetType: "radar_run",
      targetId: runId,
    });
    return { success: true as const, runId };
  } catch (error) {
    if (error instanceof RadarBusyError)
      return { success: false as const, message: "A run is already in progress" };
    return {
      success: false as const,
      message: error instanceof Error ? error.message : "Failed to start AI Radar",
    };
  }
}
