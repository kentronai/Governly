/**
 * Real queries against the `agents` table — the actual discovered-agent
 * data source for the Agent Inventory UI. Replaces the earlier
 * applications-rollup approach entirely: an Agent is only ever a row
 * discovered by the Agent Registry, optionally linked to an Application.
 */

import { db, agents, users, applications, providerModels, withDbRetry } from "@db";
import { and, eq, desc, ilike, inArray, isNull, notInArray, or, sql, count } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { policyViolations, readProfile } from "@/lib/server/agents/agent-profile";

export interface AgentListFilters {
  search?: string;
  riskLevel?: string;
  autonomyLevel?: string;
  status?: string;
  platform?: string;
  ownerUserId?: string | "unowned";
  deployed?: "yes" | "no";
  policyViolation?: "yes" | "no";
  page?: number;
  pageSize?: number;
}

export interface AgentInventorySummary {
  totalAiAgents: number;
  criticalRisk: number;
  highRisk: number;
  unownedAgents: number;
  l4Agents: number;
  l3Agents: number;
  deployedAgents: number;
  llmNotDetected: number;
  policyViolationAgents: number;
  calculatedAt: string;
}

export interface AgentFilterOptions {
  platforms: string[];
  riskLevels: string[];
  autonomyLevels: string[];
  statuses: string[];
}

export interface AgentApplicationOption {
  id: string;
  name: string;
}

/**
 * Live Agent Registry KPIs. These are agent-scoped counts only; application
 * governance rollups belong on application/compliance dashboards.
 */
/** Agents breaking at least one governance policy (same checks as the detail dialog). */
async function getPolicyViolationAgentIds(tenantId: string) {
  const [rows, approved] = await Promise.all([
    withDbRetry(() =>
      db
        .select({ id: agents.id, profile: agents.profile, model: agents.model })
        .from(agents)
        .where(eq(agents.tenantId, tenantId)),
    ),
    withDbRetry(() =>
      db
        .select({ modelId: providerModels.modelId })
        .from(providerModels)
        .where(eq(providerModels.tenantId, tenantId)),
    ),
  ]);
  const approvedIds = approved.map((m) => m.modelId);
  return rows
    .filter((row) => {
      const profile = readProfile(row.profile);
      const llms = profile.llms.length ? profile.llms : row.model ? [row.model] : [];
      return policyViolations(profile.observability, llms, approvedIds).length > 0;
    })
    .map((row) => row.id);
}

export const getAgentInventorySummary = async (
  tenantId: string,
): Promise<AgentInventorySummary> => {
  // One pass over `agents` — the former compliance/finding subqueries ran a
  // correlated scan per tenant on every poll and are gone from this view.
  const [agentMetrics] = await withDbRetry(() =>
    db
      .select({
        totalAiAgents: count(),
        criticalRisk: sql<number>`count(*) filter (where ${agents.riskLevel} = 'Critical')`,
        highRisk: sql<number>`count(*) filter (where ${agents.riskLevel} = 'High')`,
        unownedAgents: sql<number>`count(*) filter (where ${agents.ownerUserId} is null)`,
        l4Agents: sql<number>`count(*) filter (where ${agents.autonomyLevel} = 'L4')`,
        l3Agents: sql<number>`count(*) filter (where ${agents.autonomyLevel} = 'L3')`,
        deployedAgents: sql<number>`count(*) filter (where ${agents.profile}->>'deployed' = 'true')`,
        llmNotDetected: sql<number>`count(*) filter (where ${agents.model} is null and jsonb_array_length(coalesce(${agents.profile}->'llms', '[]'::jsonb)) = 0)`,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId)),
  );

  return {
    totalAiAgents: Number(agentMetrics?.totalAiAgents ?? 0),
    criticalRisk: Number(agentMetrics?.criticalRisk ?? 0),
    highRisk: Number(agentMetrics?.highRisk ?? 0),
    unownedAgents: Number(agentMetrics?.unownedAgents ?? 0),
    l4Agents: Number(agentMetrics?.l4Agents ?? 0),
    l3Agents: Number(agentMetrics?.l3Agents ?? 0),
    deployedAgents: Number(agentMetrics?.deployedAgents ?? 0),
    llmNotDetected: Number(agentMetrics?.llmNotDetected ?? 0),
    policyViolationAgents: (await getPolicyViolationAgentIds(tenantId)).length,
    calculatedAt: new Date().toISOString(),
  };
};

export const getAgents = cache(
  async (tenantId: string, filters: AgentListFilters = {}) => {
    const owner = alias(users, "owner");
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(agents.tenantId, tenantId)];
    if (filters.riskLevel)
      conditions.push(eq(agents.riskLevel, filters.riskLevel as any));
    if (filters.autonomyLevel)
      conditions.push(eq(agents.autonomyLevel, filters.autonomyLevel as any));
    if (filters.status)
      conditions.push(eq(agents.status, filters.status as any));
    if (filters.platform)
      conditions.push(eq(agents.platform, filters.platform as any));
    if (filters.ownerUserId === "unowned") {
      conditions.push(sql`${agents.ownerUserId} is null`);
    } else if (filters.ownerUserId) {
      conditions.push(eq(agents.ownerUserId, filters.ownerUserId));
    }
    if (filters.deployed === "yes") {
      conditions.push(sql`${agents.profile}->>'deployed' = 'true'`);
    } else if (filters.deployed === "no") {
      conditions.push(sql`${agents.profile}->>'deployed' is distinct from 'true'`);
    }
    if (filters.policyViolation) {
      // Violations are derived in JS (same rule as the summary card), so resolve the ids first.
      const ids = await getPolicyViolationAgentIds(tenantId);
      if (filters.policyViolation === "yes") {
        conditions.push(ids.length ? inArray(agents.id, ids) : sql`false`);
      } else if (ids.length) {
        conditions.push(notInArray(agents.id, ids));
      }
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(agents.name, term),
          ilike(agents.businessFunction, term),
          ilike(agents.model, term),
          // framework, LLMs, skills, packages, developer, deployer, apps
          sql`${agents.profile}::text ilike ${term}`,
          ilike(owner.name, term),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [rows, [{ total }]] = await withDbRetry(() =>
      Promise.all([
        db
          .select({
            id: agents.id,
            externalAgentId: agents.externalAgentId,
            name: agents.name,
            platform: agents.platform,
            region: agents.region,
            accountId: agents.accountId,
            applicationId: agents.applicationId,
            applicationName: applications.name,
            model: agents.model,
            knowledgeBaseId: agents.knowledgeBaseId,
            iamRoleArn: agents.iamRoleArn,
            credentialType: agents.credentialType,
            ownerUserId: agents.ownerUserId,
            ownerName: owner.name,
            ownerEmail: owner.email,
            ownerConfidence: agents.ownerConfidence,
            businessFunction: agents.businessFunction,
            status: agents.status,
            lastUsedAt: agents.lastUsedAt,
            capabilities: agents.capabilities,
            autonomyLevel: agents.autonomyLevel,
            autonomyReason: agents.autonomyReason,
            autonomyConfidence: agents.autonomyConfidence,
            riskScore: agents.riskScore,
            riskLevel: agents.riskLevel,
            profile: agents.profile,
            langsmithProject: agents.langsmithProject,
            discoverySource: agents.discoverySource,
            firstSeenAt: agents.firstSeenAt,
            lastSeenAt: agents.lastSeenAt,
            syncStatus: agents.syncStatus,
            createdAt: agents.createdAt,
            updatedAt: agents.updatedAt,
          })
          .from(agents)
          .leftJoin(owner, eq(agents.ownerUserId, owner.id))
          .leftJoin(applications, eq(agents.applicationId, applications.id))
          .where(whereClause)
          .orderBy(desc(agents.riskScore), desc(agents.lastSeenAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(agents)
          .leftJoin(owner, eq(agents.ownerUserId, owner.id))
          .where(whereClause),
      ]),
    );

    return {
      rows,
      total: Number(total),
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(Number(total) / pageSize)),
    };
  },
);

export const getAgentDetail = cache(
  async (tenantId: string, agentId: string) => {
    const agent = await withDbRetry(() =>
      db.query.agents.findFirst({
        where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
        with: {
          agentResources: true,
          agentRecommendations: {
            orderBy: (t, { desc }) => [desc(t.createdAt)],
          },
          owner: { columns: { id: true, name: true, email: true } },
          application: { columns: { id: true, name: true } },
        },
      }),
    );
    if (!agent) return null;
    // The tenant's Model Registry is the approved-model list for policy checks.
    const approved = await withDbRetry(() =>
      db
        .select({ modelId: providerModels.modelId })
        .from(providerModels)
        .where(eq(providerModels.tenantId, tenantId)),
    );
    return { ...agent, approvedModels: approved.map((m) => m.modelId) };
  },
);

export const getAgentFilterOptions = cache(async (tenantId: string) => {
  const rows = await withDbRetry(() =>
    db
      .select({
        platform: agents.platform,
        riskLevel: agents.riskLevel,
        autonomyLevel: agents.autonomyLevel,
        status: agents.status,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId)),
  );

  const uniq = <T>(values: (T | null)[]) =>
    Array.from(new Set(values.filter(Boolean) as T[]));

  return {
    platforms: uniq(rows.map((r) => r.platform)),
    riskLevels: uniq(rows.map((r) => r.riskLevel)),
    autonomyLevels: uniq(rows.map((r) => r.autonomyLevel)),
    statuses: uniq(rows.map((r) => r.status)),
  };
});

export const getAgentApplicationOptions = cache(
  async (tenantId: string): Promise<AgentApplicationOption[]> =>
    withDbRetry(() =>
      db
        .select({ id: applications.id, name: applications.name })
        .from(applications)
        .where(
          and(
            eq(applications.tenantId, tenantId),
            isNull(applications.deletedAt),
          ),
        )
        .orderBy(applications.name),
    ),
);

export const getAgentInventoryInitialData = cache(
  async (tenantId: string, filters: AgentListFilters = {}) => {
    const [list, summary, options, applicationOptions] = await Promise.all([
      getAgents(tenantId, filters),
      getAgentInventorySummary(tenantId),
      getAgentFilterOptions(tenantId),
      getAgentApplicationOptions(tenantId),
    ]);
    return { list, summary, options, applicationOptions };
  },
);

export type AgentInventoryInitialData = Awaited<
  ReturnType<typeof getAgentInventoryInitialData>
>;
