/**
 * Real queries against the `agents` table — the actual discovered-agent
 * data source for the Agent Inventory UI. Replaces the earlier
 * applications-rollup approach entirely: an Agent is only ever a row
 * discovered by the Agent Registry, optionally linked to an Application.
 */

import { db, agents, users, applications, tenants } from "@db";
import { and, eq, desc, ilike, isNull, or, sql, count } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";

export interface AgentListFilters {
  search?: string;
  riskLevel?: string;
  autonomyLevel?: string;
  status?: string;
  platform?: string;
  ownerUserId?: string | "unowned";
  page?: number;
  pageSize?: number;
}

export interface AgentInventorySummary {
  totalAiAgents: number;
  criticalRisk: number;
  highRisk: number;
  unownedApplications: number;
  missingControlnetPolicy: number;
  nonCompliant: number;
  dormantApplications: number;
  policyViolations30d: number;
  agentsWithOpenFindings: number;
  agentsWithoutRuntimeEvidence: number;
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
 * Live inventory KPIs. Application metrics intentionally use application
 * governance records; they are not aliases for agent counts.
 */
export const getAgentInventorySummary = async (
  tenantId: string,
): Promise<AgentInventorySummary> => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [[agentMetrics], [applicationMetrics]] = await Promise.all([
    db
      .select({
        totalAiAgents: count(),
        criticalRisk: sql<number>`count(*) filter (where ${agents.riskLevel} = 'Critical')`,
        highRisk: sql<number>`count(*) filter (where ${agents.riskLevel} = 'High')`,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId)),
    db
      .select({
        unownedApplications: sql<number>`(
          select count(*) from applications a
          where a.tenant_id = ${tenantId}
            and a.deleted_at is null
            and not exists (
              select 1 from stakeholders s
              where s.tenant_id = ${tenantId}
                and s.application_id = a.id
                and lower(s.role) like '%owner%'
            )
        )`,
        missingControlnetPolicy: sql<number>`(
          select count(*) from applications a
          where a.tenant_id = ${tenantId}
            and a.deleted_at is null
            and not exists (
              select 1 from application_policies ap
              where ap.tenant_id = ${tenantId}
                and ap.application_id = a.id
                and ap.is_active = true
                and ap.is_default = true
            )
        )`,
        nonCompliant: sql<number>`(
          select count(distinct a.id) from applications a
          join application_policy_center apc
            on apc.application_id = a.id::text
           and apc.tenant_id = ${tenantId}
           and apc."isActive" = true
          where a.tenant_id = ${tenantId}
            and a.deleted_at is null
            and apc.compliance_status = 'non_compliant'
        )`,
        dormantApplications: sql<number>`(
          select count(*) from applications a
          where a.tenant_id = ${tenantId}
            and a.deleted_at is null
            and a.created_at < ${since}::timestamptz
            and not exists (
              select 1 from observability_logs ol
              where ol.tenant_id = ${tenantId}
                and ol.application_id = a.id
                and ol.timestamp >= ${since}::timestamptz
            )
        )`,
        policyViolations30d: sql<number>`(
          select count(*) from observability_logs ol
          where ol.tenant_id = ${tenantId}
            and ol.timestamp >= ${since}::timestamptz
            and (
              ol.guardrail_results->'_summary'->>'was_blocked' = 'true'
              or ol.guardrail_results->>'policy_decision' = 'block'
              or ol.guardrail_results->>'blocked' = 'true'
            )
        )`,
        agentsWithOpenFindings: sql<number>`(
          select count(distinct pf.agent_id) from policy_findings pf
          where pf.tenant_id = ${tenantId}
            and pf.agent_id is not null
            and pf.status = 'open'
        )`,
        agentsWithoutRuntimeEvidence: sql<number>`(
          select count(*) from agents ag
          where ag.tenant_id = ${tenantId}
            and not exists (
              select 1 from observability_logs ol
              where ol.tenant_id = ${tenantId}
                and ol.agent_id = ag.id
                and ol.guardrail_results is not null
            )
        )`,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  ]);

  return {
    totalAiAgents: Number(agentMetrics?.totalAiAgents ?? 0),
    criticalRisk: Number(agentMetrics?.criticalRisk ?? 0),
    highRisk: Number(agentMetrics?.highRisk ?? 0),
    unownedApplications: Number(applicationMetrics?.unownedApplications ?? 0),
    missingControlnetPolicy: Number(
      applicationMetrics?.missingControlnetPolicy ?? 0,
    ),
    nonCompliant: Number(applicationMetrics?.nonCompliant ?? 0),
    dormantApplications: Number(applicationMetrics?.dormantApplications ?? 0),
    policyViolations30d: Number(applicationMetrics?.policyViolations30d ?? 0),
    agentsWithOpenFindings: Number(
      applicationMetrics?.agentsWithOpenFindings ?? 0,
    ),
    agentsWithoutRuntimeEvidence: Number(
      applicationMetrics?.agentsWithoutRuntimeEvidence ?? 0,
    ),
    calculatedAt: new Date().toISOString(),
  };
};

export const getAgents = cache(
  async (tenantId: string, filters: AgentListFilters = {}) => {
    const owner = alias(users, "owner");
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
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
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(agents.name, term),
          ilike(agents.businessFunction, term),
          ilike(agents.model, term),
          ilike(owner.name, term),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
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
          autonomyLevel: agents.autonomyLevel,
          autonomyReason: agents.autonomyReason,
          autonomyConfidence: agents.autonomyConfidence,
          riskScore: agents.riskScore,
          riskLevel: agents.riskLevel,
          compliancePolicyName: sql<string | null>`(
          select ape.policy_name
          from agent_policy_evaluations ape
          where ape.agent_id = ${agents.id}
            and ape.tenant_id = ${tenantId}
            and ape.is_active = true
            and ape.policy_type = 'compliance'
          order by ape.evaluated_at desc
          limit 1
        )`,
          complianceStatus: sql<string | null>`(
          select ape.compliance_status
          from agent_policy_evaluations ape
          where ape.agent_id = ${agents.id}
            and ape.tenant_id = ${tenantId}
            and ape.is_active = true
            and ape.policy_type = 'compliance'
          order by ape.evaluated_at desc
          limit 1
        )`,
          complianceCoverage: sql<number | null>`(
          select ape.coverage_score
          from agent_policy_evaluations ape
          where ape.agent_id = ${agents.id}
            and ape.tenant_id = ${tenantId}
            and ape.is_active = true
            and ape.policy_type = 'compliance'
          order by ape.evaluated_at desc
          limit 1
        )`,
          openFindingCount: sql<number>`(
          select count(*)
          from policy_findings pf
          where pf.agent_id = ${agents.id}
            and pf.tenant_id = ${tenantId}
            and pf.status = 'open'
        )`,
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
    ]);

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
    const agent = await db.query.agents.findFirst({
      where: and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)),
      with: {
        agentResources: true,
        agentRecommendations: {
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        },
        owner: { columns: { id: true, name: true, email: true } },
        application: { columns: { id: true, name: true } },
        policyEvaluations: {
          where: (rows, { eq }) => eq(rows.isActive, true),
          orderBy: (rows, { desc }) => [desc(rows.evaluatedAt)],
        },
        policyFindings: {
          where: (rows, { eq }) => eq(rows.status, "open"),
          orderBy: (rows, { desc }) => [desc(rows.lastDetectedAt)],
        },
      },
    });
    return agent ?? null;
  },
);

export const getAgentFilterOptions = cache(async (tenantId: string) => {
  const rows = await db
    .select({
      platform: agents.platform,
      riskLevel: agents.riskLevel,
      autonomyLevel: agents.autonomyLevel,
      status: agents.status,
    })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));

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
