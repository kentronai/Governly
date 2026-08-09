"use server";

import { db, observabilityLogs, applicationPolicies } from "@db";
import {
  and,
  eq,
  desc,
  isNotNull,
  sql,
  ilike,
  gte,
  or,
} from "drizzle-orm";

import {
  isAllowedSql,
  isBlockedSql,
  isErrorSql,
  isInferenceTrafficSql,
} from "@/lib/server/observability-filters";

// Application observability logs are filtered by application_id
// ControlNet auto-resolves application_id from policy via application_policies table
// So observability_logs.application_id should always be set when policies are properly linked

export interface RecentEndpointsPaginatedResponse {
  page: number;
  limit: number;
  total: number;
  totalPage: number;
  prev: number | null;
  next: number | null;

  data: (typeof observabilityLogs.$inferSelect & { applicationName: string; agentName: string | null })[];
}

export const getApplicationRecentEndpoints = async ({
  tenantId,
  applicationId,
  page = 1,
  limit = 10,
  show = "all",
  search,
}: {
  tenantId: string;
  applicationId: string;
  page?: number;
  limit?: number;
  show?: string;
  search?: string;
}): Promise<RecentEndpointsPaginatedResponse> => {
  const offset = (page - 1) * limit;

  const filters: any[] = [
    eq(observabilityLogs.tenantId, tenantId),
    eq(observabilityLogs.applicationId, applicationId),
    isNotNull(observabilityLogs.statusCode),
    isInferenceTrafficSql,
  ];

  // Apply show filter — "blocked" means a guardrail blocked it, not merely
  // that the request failed.
  if (show === "blocked") {
    filters.push(isBlockedSql);
  } else if (show === "allowed") {
    filters.push(isAllowedSql);
  } else if (show === "error") {
    filters.push(isErrorSql);
  }
  // If show === "all", don't filter by status code
  
  if (search && search.trim() !== "") {
    const term = `%${search.trim()}%`;

    filters.push(
      or(
        ilike(observabilityLogs.path, term),
        ilike(observabilityLogs.method, term),
        ilike(sql`CAST(${observabilityLogs.requestPayload} AS TEXT)`, term)
      )
    );
  }

  const logs = await db.query.observabilityLogs.findMany({
    where: and(...filters),
    orderBy: desc(observabilityLogs.createdAt),
    with: {
      application: true,
      agent: true,
    },
    limit,
    offset,
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(observabilityLogs)
    .where(and(...filters));

  const total = Number(count);
  const totalPage = Math.ceil(total / limit);

  return {
    data: logs.map((ele) => {
      return { ...ele, applicationName: ele.application?.name ?? "Unknown", agentName: ele.agent?.name ?? null };
    }),
    page,
    limit,
    total,
    totalPage,
    prev: page > 1 ? page - 1 : null,
    next: page < totalPage ? page + 1 : null,
  };
};
export const getTenantRecentEndpoints = async ({
  tenantId,
  page = 1,
  limit = 10,
  show = "all",
  search,
}: {
  tenantId: string;
  page?: number;
  limit?: number;
  show?: string;
  search?: string;
}): Promise<RecentEndpointsPaginatedResponse> => {
  const offset = (page - 1) * limit;

  const filters: any[] = [
    eq(observabilityLogs.tenantId, tenantId),
    isNotNull(observabilityLogs.statusCode),
    isInferenceTrafficSql,
  ];

  // Apply show filter — "blocked" means a guardrail blocked it, not merely
  // that the request failed.
  if (show === "blocked") {
    filters.push(isBlockedSql);
  } else if (show === "allowed") {
    filters.push(isAllowedSql);
  } else if (show === "error") {
    filters.push(isErrorSql);
  }
  // If show === "all", don't filter by status code

  if (search && search.trim() !== "") {
    const term = `%${search.trim()}%`;

    filters.push(
      or(
        ilike(observabilityLogs.path, term),
        ilike(observabilityLogs.method, term),
        ilike(sql`CAST(${observabilityLogs.requestPayload} AS TEXT)`, term)
      )
    );
  }

  const logs = await db.query.observabilityLogs.findMany({
    where: and(...filters),
    orderBy: desc(observabilityLogs.createdAt),
    limit,
    offset,
    with: {
      application: true,
      agent: true,
    },
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(observabilityLogs)
    .where(and(...filters));

  const total = Number(count);
  const totalPage = Math.ceil(total / limit);

  return {
    data: logs.map((ele) => {
      return { ...ele, applicationName: ele.application?.name ?? "Unknown", agentName: ele.agent?.name ?? null };
    }),
    page,
    limit,
    total,
    totalPage,
    prev: page > 1 ? page - 1 : null,
    next: page < totalPage ? page + 1 : null,
  };
};
export interface RequestStatsGraphResponse {
  totalAccepted: number;
  /** Requests a guardrail actually blocked. */
  totalBlocked: number;
  /** Requests that failed without reaching a policy decision. */
  totalErrored: number;
  totalRequests: number;
  daily: {
    day: string;
    passed: number;
    blocked: number;
    errored: number;
  }[];
  categoryBreakdown: {
    category: string;
    count: number;
  }[];
}

export const getApplicationGraphStats = async ({
  tenantId,
  applicationId,
}: {
  tenantId: string;
  applicationId: string;
}): Promise<RequestStatsGraphResponse> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString(); // ✅ Convert to ISO string

  const baseFilters: any[] = [
    eq(observabilityLogs.tenantId, tenantId),
    eq(observabilityLogs.applicationId, applicationId),
    isNotNull(observabilityLogs.statusCode),
    isInferenceTrafficSql,
    gte(observabilityLogs.createdAt, startDateStr), // ✅ Use string instead of Date
  ];

  // These four queries are independent of one another — run them concurrently
  // instead of paying for four sequential round trips.
  const [acceptedResult, blockedResult, blockedLogs, rows] = await Promise.all([
    // ----- TOTAL ACCEPTED -----
    db
      .select({ accepted: sql<number>`count(*)` })
      .from(observabilityLogs)
      .where(and(...baseFilters, isAllowedSql)),
    // ----- TOTAL BLOCKED (guardrail decision, not "any failure") -----
    db
      .select({
        blocked: sql<number>`count(*) filter (where ${isBlockedSql})`,
        errored: sql<number>`count(*) filter (where ${isErrorSql})`,
      })
      .from(observabilityLogs)
      .where(and(...baseFilters)),
    // Category breakdown for blocked requests
    db.query.observabilityLogs.findMany({
      columns: {
        guardrailResults: true,
      },
      where: and(
        ...baseFilters,
        isBlockedSql,
        isNotNull(observabilityLogs.guardrailResults)
      ),
    }),
    // Daily passed/blocked breakdown
    db
      .select({
        day: sql<string>`to_char(${observabilityLogs.createdAt}, 'YYYY-MM-DD')`,
        passed: sql<number>`count(*) filter (where ${isAllowedSql})`,
        blocked: sql<number>`count(*) filter (where ${isBlockedSql})`,
        errored: sql<number>`count(*) filter (where ${isErrorSql})`,
      })
      .from(observabilityLogs)
      .where(and(...baseFilters))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const accepted = Number(acceptedResult[0]?.accepted ?? 0);
  const blocked = Number(blockedResult[0]?.blocked ?? 0);
  const errored = Number(blockedResult[0]?.errored ?? 0);
  const totalRequests = accepted + blocked + errored;

  const categoryCounts = new Map<string, number>();
  for (const log of blockedLogs) {
    const results = log.guardrailResults as any;
    const violatedGuard = results?.violated_guard || results?._summary?.violation;
    const ruleId = violatedGuard?.rule_id || violatedGuard?.rule_id;

    if (ruleId && typeof ruleId === 'string') {
      const category = ruleId.split('.')[0];
      if (category) {
        const normalizedCategory = category.toLowerCase();
        categoryCounts.set(
          normalizedCategory,
          (categoryCounts.get(normalizedCategory) || 0) + 1
        );
      }
    }
  }

  const categoryBreakdown = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Generate full 30 days
  const daily = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dayKey = d.toISOString().slice(0, 10);

    const row = rows.find((r) => r.day === dayKey);

    daily.push({
      day: dayKey,
      passed: Number(row?.passed ?? 0),
      blocked: Number(row?.blocked ?? 0),
      errored: Number(row?.errored ?? 0),
    });
  }

  return {
    totalAccepted: accepted,
    totalBlocked: blocked,
    totalErrored: errored,
    totalRequests,
    daily,
    categoryBreakdown,
  };
};

export const getTenantGraphStats = async ({
  tenantId,
}: {
  tenantId: string;
}): Promise<RequestStatsGraphResponse> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString(); // ✅ Convert to ISO string

  const baseFilters: any[] = [
    eq(observabilityLogs.tenantId, tenantId),
    isNotNull(observabilityLogs.statusCode),
    isInferenceTrafficSql,
    gte(observabilityLogs.createdAt, startDateStr), // ✅ Use string instead of Date
  ];

  // These four queries are independent of one another — run them concurrently
  // instead of paying for four sequential round trips.
  const [acceptedResult, blockedResult, blockedLogs, rows] = await Promise.all([
    // ----- TOTAL ACCEPTED -----
    db
      .select({ accepted: sql<number>`count(*)` })
      .from(observabilityLogs)
      .where(and(...baseFilters, isAllowedSql)),
    // ----- TOTAL BLOCKED (guardrail decision, not "any failure") -----
    db
      .select({
        blocked: sql<number>`count(*) filter (where ${isBlockedSql})`,
        errored: sql<number>`count(*) filter (where ${isErrorSql})`,
      })
      .from(observabilityLogs)
      .where(and(...baseFilters)),
    // Category breakdown for blocked requests
    db.query.observabilityLogs.findMany({
      columns: {
        guardrailResults: true,
      },
      where: and(
        ...baseFilters,
        isBlockedSql,
        isNotNull(observabilityLogs.guardrailResults)
      ),
    }),
    // Daily passed/blocked breakdown
    db
      .select({
        day: sql<string>`to_char(${observabilityLogs.createdAt}, 'YYYY-MM-DD')`,
        passed: sql<number>`count(*) filter (where ${isAllowedSql})`,
        blocked: sql<number>`count(*) filter (where ${isBlockedSql})`,
        errored: sql<number>`count(*) filter (where ${isErrorSql})`,
      })
      .from(observabilityLogs)
      .where(and(...baseFilters))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const accepted = Number(acceptedResult[0]?.accepted ?? 0);
  const blocked = Number(blockedResult[0]?.blocked ?? 0);
  const errored = Number(blockedResult[0]?.errored ?? 0);
  const totalRequests = accepted + blocked + errored;

  const categoryCounts = new Map<string, number>();
  for (const log of blockedLogs) {
    const results = log.guardrailResults as any;
    const violatedGuard = results?.violated_guard || results?._summary?.violation;
    const ruleId = violatedGuard?.rule_id || violatedGuard?.rule_id;

    if (ruleId && typeof ruleId === 'string') {
      const category = ruleId.split('.')[0];
      if (category) {
        const normalizedCategory = category.toLowerCase();
        categoryCounts.set(
          normalizedCategory,
          (categoryCounts.get(normalizedCategory) || 0) + 1
        );
      }
    }
  }

  const categoryBreakdown = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Generate full 30 days
  const daily = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const dayKey = d.toISOString().slice(0, 10);

    const row = rows.find((r) => r.day === dayKey);

    daily.push({
      day: dayKey,
      passed: Number(row?.passed ?? 0),
      blocked: Number(row?.blocked ?? 0),
      errored: Number(row?.errored ?? 0),
    });
  }

  return {
    totalAccepted: accepted,
    totalBlocked: blocked,
    totalErrored: errored,
    totalRequests,
    daily,
    categoryBreakdown,
  };
};
