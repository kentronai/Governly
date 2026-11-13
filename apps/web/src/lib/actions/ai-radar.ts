"use server";

import { radarModelCandidates } from "@/lib/server/radar/llm";
import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, getTableColumns, ilike, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  globalAiPolicies,
  radarCoverage,
  radarRuns,
  radarUpdates,
  tenants,
} from "@db";
import { POLICY_CATEGORIES } from "@/lib/radar-categories";
import { createAuditEvent } from "@/lib/server/audit";
import {
  RADAR_INTERVAL_HOURS,
  RadarBusyError,
  RadarNoKeyError,
  RadarUnavailableError,
  radarEnabled,
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
  const { orgId } = await auth();
  // Cheap presence check (no network ping); the run itself verifies the key works.
  const hasKey = (await radarModelCandidates(orgId ?? undefined)).length > 0;
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

  const [recent] = await db
    .select({ n: sql<number>`count(*)` })
    .from(radarUpdates)
    .where(and(isNotNull(radarUpdates.publishedDate), sql`${radarUpdates.detectedAt} > now() - interval '7 days'`));

  // A "running" row older than the run lock means the server died mid-run.
  const stale =
    lastRun?.status === "running" &&
    Date.now() - new Date(lastRun.startedAt).getTime() > 3 * 3_600_000;
  return {
    lastRun: lastRun
      ? { ...lastRun, status: stale ? "interrupted" : lastRun.status }
      : null,
    enabled: radarEnabled(),
    hasKey,
    intervalHours: RADAR_INTERVAL_HOURS,
    newThisWeek: Number(recent.n),
    coverage: {
      total: Number(cov.total),
      enabled: Number(cov.enabled),
      noSources: Number(cov.noSources),
    },
  };
}

export interface RadarUpdateFilters {
  region?: string;
  country?: string;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Updates the agent found, newest first, narrowed by the page filters. One page at a time. */
export async function getRadarUpdates(filters: RadarUpdateFilters = {}) {
  await requireUser();
  const { region, country, category, search, page = 1, pageSize = 20 } = filters;
  const q = search?.trim();
  const where = and(
    isNotNull(radarUpdates.publishedDate),
    region ? eq(globalAiPolicies.region, region) : undefined,
    country ? eq(globalAiPolicies.country, country) : undefined,
    category ? eq(globalAiPolicies.category, category) : undefined,
    q
      ? or(
          ilike(radarUpdates.title, `%${q}%`),
          ilike(radarUpdates.summary, `%${q}%`),
          ilike(radarUpdates.jurisdiction, `%${q}%`),
        )
      : undefined,
  );
  const size = Math.min(Math.max(pageSize, 1), 200);

  const [data, [{ total }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(radarUpdates),
        region: globalAiPolicies.region,
        country: globalAiPolicies.country,
        category: globalAiPolicies.category,
        policyName: globalAiPolicies.policyName,
        status: globalAiPolicies.status,
        policyEffectiveDate: globalAiPolicies.effectiveDate,
        policySummary: globalAiPolicies.summary,
        whoIsAffected: globalAiPolicies.whoIsAffected,
        complianceRequirements: globalAiPolicies.complianceRequirements,
        enforcementDetails: globalAiPolicies.enforcementDetails,
      })
      .from(radarUpdates)
      .leftJoin(globalAiPolicies, eq(radarUpdates.policyId, globalAiPolicies.id))
      .where(where)
      // Newest publication first; undated (static-page) finds fall back to when we saw them.
      .orderBy(
        sql`coalesce(${radarUpdates.publishedDate}, ${radarUpdates.detectedAt}::date) desc`,
        desc(radarUpdates.detectedAt),
        radarUpdates.title,
      )
      .limit(size)
      .offset((Math.max(page, 1) - 1) * size),
    db
      .select({ total: sql<number>`count(*)` })
      .from(radarUpdates)
      .leftJoin(globalAiPolicies, eq(radarUpdates.policyId, globalAiPolicies.id))
      .where(where),
  ]);
  return { data, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / size)) };
}

/** Dropdown values from the coverage registry; countries are limited to the chosen region. */
export async function getRadarFilterOptions(region?: string) {
  await requireUser();
  const country = sql<string>`coalesce(${radarCoverage.country}, ${radarCoverage.jurisdictionName})`;
  const [regions, countries] = await Promise.all([
    db
      .selectDistinct({ v: radarCoverage.region })
      .from(radarCoverage)
      .where(and(eq(radarCoverage.isEnabled, true), sql`${radarCoverage.region} is not null`))
      .orderBy(radarCoverage.region),
    db
      .selectDistinct({ v: country })
      .from(radarCoverage)
      .where(and(eq(radarCoverage.isEnabled, true), region ? eq(radarCoverage.region, region) : undefined))
      .orderBy(country),
  ]);
  return {
    regions: regions.map((r) => r.v as string),
    countries: countries.map((c) => c.v),
    categories: [...POLICY_CATEGORIES],
  };
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
  region: z.string().trim().max(80).optional(),
  country: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
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
  const row = {
    ...values,
    instrumentsTracked: values.instrumentsTracked || null,
    region: values.region || null,
    country: values.country || null,
    state: values.state || null,
  };
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
    if (error instanceof RadarUnavailableError)
      return { success: false as const, message: error.message };
    if (error instanceof RadarNoKeyError)
      return { success: false as const, message: error.message, needsKey: true as const };
    if (error instanceof RadarBusyError)
      return { success: false as const, message: "A run is already in progress" };
    return { success: false as const, message: "AI Radar is currently unavailable. Please try again later." };
  }
}
