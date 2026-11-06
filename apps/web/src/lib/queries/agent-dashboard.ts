/** Live, tenant-scoped analytics for the Agent Registry module. */
import {
  db,
  agents,
  awsDiscoveryConnections,
  azureDiscoveryConnections,
  discoveryScans,
  integrations,
  observabilityLogs,
  providerModels,
  reports,
  tenants,
  withDbRetry,
} from "@db";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { cache } from "react";
import {
  policyViolations,
  isEverDeployed,
  profileAutonomy,
  readProfile,
} from "@/lib/server/agents/agent-profile";

const AUTONOMY_LEVELS = ["L1", "L2", "L3", "L4"] as const;
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;

export const resolveAgentDiscoveryTenantId = cache(async (slugOrId: string) => {
  const [byId] = await withDbRetry(() =>
    db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, slugOrId))
      .limit(1),
  );
  if (byId) return byId.id;
  const [bySlug] = await withDbRetry(() =>
    db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slugOrId))
      .limit(1),
  );
  if (!bySlug) throw new Error("Tenant not found");
  return bySlug.id;
});

/** Every agent's registry profile with its capability-based autonomy. */
const getProfiles = cache(async (tenantId: string) => {
  const rows = await withDbRetry(() =>
    db
      .select({
        id: agents.id,
        name: agents.name,
        platform: agents.platform,
        profile: agents.profile,
        model: agents.model,
        firstSeenAt: agents.firstSeenAt,
        updatedAt: agents.updatedAt,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId)),
  );
  return rows.map((row) => {
    const profile = readProfile(row.profile);
    return { ...row, profile, autonomy: profileAutonomy(profile) };
  });
});

export const getDashboardCards = cache(async (tenantId: string) => {
  const rows = await getProfiles(tenantId);
  const level = (l: string) => rows.filter((r) => r.autonomy.level === l).length;
  return {
    total: rows.length,
    l1: level("L1"),
    l2: level("L2"),
    l3: level("L3"),
    l4: level("L4"),
    running: rows.filter((r) => r.profile.deployed).length,
    // Deployed = ever deployed (running + stopped).
    deployed: rows.filter((r) => isEverDeployed(r.profile)).length,
    // Deployed before, not running now.
    stopped: rows.filter((r) => !r.profile.deployed && r.profile.deployedAt).length,
  };
});

export const getAutonomyDistribution = cache(async (tenantId: string) => {
  const rows = await getProfiles(tenantId);
  return AUTONOMY_LEVELS.map((level) => ({
    level,
    count: rows.filter((r) => r.autonomy.level === level).length,
  }));
});

/** Governance violations on every agent's profile, newest-updated agents first. */
export const getAgentPolicyViolations = cache(async (tenantId: string, limit = 10) => {
  const [rows, approved] = await Promise.all([
    getProfiles(tenantId),
    withDbRetry(() =>
      db
        .select({ modelId: providerModels.modelId })
        .from(providerModels)
        .where(eq(providerModels.tenantId, tenantId)),
    ),
  ]);
  const approvedIds = approved.map((m) => m.modelId);
  return rows
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .flatMap((r) =>
      policyViolations(r.profile.observability, r.profile.llms, approvedIds).map((v) => ({
        agentId: r.id,
        agentName: r.name,
        platform: r.platform,
        detectedAt: r.updatedAt,
        ...v,
      })),
    )
    .slice(0, limit);
});

export const getAutonomyStatistics = cache(async (tenantId: string) => {
  const [distribution, examples] = await Promise.all([
    getAutonomyDistribution(tenantId),
    db
      .select({
        level: agents.autonomyLevel,
        name: agents.name,
        reason: agents.autonomyReason,
        evidence: agents.autonomyEvidence,
        confidence: agents.autonomyConfidence,
        classifiedAt: agents.autonomyClassifiedAt,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .orderBy(desc(agents.autonomyClassifiedAt)),
  ]);
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  return distribution.map((item) => ({
    ...item,
    percentage: total === 0 ? 0 : Math.round((item.count / total) * 1000) / 10,
    examples: examples
      .filter((agent) => agent.level === item.level)
      .slice(0, 3),
  }));
});

export const getOwnershipBreakdown = cache(async (tenantId: string) => {
  const [row] = await db
    .select({
      owned: sql<number>`count(*) filter (where ${agents.ownerUserId} is not null)`,
      unowned: sql<number>`count(*) filter (where ${agents.ownerUserId} is null)`,
    })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));
  return [
    { label: "Owned", count: Number(row?.owned ?? 0) },
    { label: "Unowned", count: Number(row?.unowned ?? 0) },
  ];
});

export const getCredentialTypeBreakdown = cache(async (tenantId: string) => {
  const rows = await db
    .select({
      label: sql<string>`case
      when ${agents.iamRoleArn} is not null then 'IAM Role'
      when ${agents.credentialType} = 'service_account' then 'Service Account'
      when ${agents.credentialType} = 'oauth' then 'OAuth Token'
      when ${agents.credentialType} = 'api_key' then 'API Key'
      else 'Other'
    end`,
      value: count(),
    })
    .from(agents)
    .where(eq(agents.tenantId, tenantId))
    .groupBy(sql`1`);
  return rows.map((row) => ({ label: row.label, count: Number(row.value) }));
});

export const getPlatformDistribution = cache(async (tenantId: string) => {
  const rows = await db
    .select({ platform: agents.platform, value: count() })
    .from(agents)
    .where(eq(agents.tenantId, tenantId))
    .groupBy(agents.platform);
  const labels: Record<string, string> = {
    aws_bedrock: "AWS Bedrock",
    aws_agentcore: "AWS AgentCore",
    aws_lambda: "Lambda",
    aws_step_functions: "Step Functions",
    aws_ec2: "AWS EC2",
    amazon_q: "Amazon Q",
    azure_openai: "Azure OpenAI",
    azure_ai_foundry: "Azure AI Foundry",
    azure_functions: "Azure Functions",
    azure_logic_apps: "Azure Logic Apps",
    azure_virtual_machines: "Azure VMs",
    azure_container_apps: "Azure Container Apps",
    azure_aks: "Azure AKS",
    gcp_vertex_ai: "Vertex AI",
    gcp_cloud_run: "Google Cloud Run",
    gcp_compute: "Google Compute Engine",
    gcp_gke: "Google GKE",
    gcp_functions: "Google Cloud Functions",
    databricks_model_serving: "Databricks Model Serving",
    databricks_unity_catalog: "Databricks Unity Catalog",
    databricks_apps: "Databricks Apps",
    databricks_jobs: "Databricks Jobs",
    databricks_genie: "Databricks Genie Agent",
    github: "GitHub (code only)",
  };
  return rows.map((row) => ({
    label: labels[row.platform] ?? "Other",
    platform: row.platform,
    count: Number(row.value),
  }));
});

export const getRiskLevelBreakdown = cache(async (tenantId: string) => {
  const rows = await db
    .select({ level: agents.riskLevel, value: count() })
    .from(agents)
    .where(eq(agents.tenantId, tenantId))
    .groupBy(agents.riskLevel);
  const values = new Map(rows.map((row) => [row.level, Number(row.value)]));
  return RISK_LEVELS.map((level) => ({ level, count: values.get(level) ?? 0 }));
});

export const getRecentAgents = cache(async (tenantId: string, limit = 8) =>
  (await getProfiles(tenantId))
    .sort((a, b) => String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)))
    .slice(0, limit),
);

export const getDiscoveryTrend = cache(async (tenantId: string) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${agents.firstSeenAt}), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), gte(agents.firstSeenAt, since)))
    .groupBy(sql`date_trunc('day', ${agents.firstSeenAt})`)
    .orderBy(sql`date_trunc('day', ${agents.firstSeenAt})`);
  return rows.map((row) => ({ date: row.day, count: Number(row.value) }));
});

export const getDiscoveryJourney = cache(async (tenantId: string) => {
  const [sources, scans, autonomy, profiles, [lastExport]] = await Promise.all([
    // Every connected integration that runs agent discovery (AWS, GitHub, Databricks, …).
    db
      .select({
        id: integrations.id,
        name: integrations.name,
        enabled: integrations.isEnabled,
        lastSyncAt: integrations.lastSyncAt,
        syncStatus: integrations.syncStatus,
        error: integrations.errorMessage,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.tenantId, tenantId),
          eq(integrations.isEnabled, true),
          eq(integrations.isCredentialsAdded, true),
          sql`exists (select 1 from ${discoveryScans} where ${discoveryScans.integrationId} = ${integrations.id})`,
        ),
      ),
    db
      .select()
      .from(discoveryScans)
      .where(eq(discoveryScans.tenantId, tenantId))
      .orderBy(desc(discoveryScans.createdAt))
      .limit(200),
    getAutonomyDistribution(tenantId),
    getProfiles(tenantId),
    db
      .select({
        generatedAt: reports.generatedAt,
        metadata: reports.metadata,
        name: reports.name,
      })
      .from(reports)
      .where(
        and(
          eq(reports.tenantId, tenantId),
          eq(reports.reportType, "executive"),
          sql`${reports.metadata}->>'module' = 'ai_agent_discovery'`,
        ),
      )
      .orderBy(desc(reports.generatedAt))
      .limit(1),
  ]);
  // Latest scan of each connected source.
  const latest = sources
    .map((src) => scans.find((scan) => scan.integrationId === src.id))
    .filter((scan): scan is (typeof scans)[number] => Boolean(scan));
  const resourcesScanned = latest.reduce(
    (sum, scan) =>
      sum +
      Object.values((scan.resourcesScanned ?? {}) as Record<string, unknown>).reduce<number>(
        (n, v) => n + Number(v || 0),
        0,
      ),
    0,
  );
  const durationMs = latest.reduce(
    (sum, scan) =>
      sum +
      (scan.startedAt && scan.finishedAt
        ? new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime()
        : 0),
    0,
  );
  const lastScan = latest
    .map((scan) => scan.finishedAt ?? scan.startedAt)
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  const failed = latest.filter((scan) => scan.status === "failed");
  const healthy = (src: (typeof sources)[number]) => src.syncStatus !== "failed" && !src.error;
  return {
    connect: {
      connected: sources.some(healthy),
      connectedAccounts: sources.length,
      lastAuthentication: sources.map((src) => src.lastSyncAt).filter(Boolean).sort().pop() ?? null,
      connections: sources.map((src) => ({
        id: src.id,
        name: src.name,
        lastSyncAt: src.lastSyncAt,
        healthy: healthy(src),
        error: src.error,
      })),
    },
    discover: {
      status: latest.length && failed.length < latest.length ? "completed" : latest.length ? "failed" : "not_started",
      lastScan,
      agentsDiscovered: profiles.length,
      resourcesScanned,
      durationMs: latest.length ? durationMs : null,
      error: failed.length ? `${failed.length} source(s) failed on last scan` : null,
    },
    classify: {
      levels: autonomy,
      classified: profiles.length,
      completed: profiles.length > 0,
    },
    report: {
      generated: Boolean(lastExport),
      lastExport: lastExport?.generatedAt ?? null,
      lastFormat:
        (lastExport?.metadata as { format?: string } | null)?.format ?? null,
      formats: ["PDF", "CSV", "Excel"],
    },
  };
});

export const getRecentViolations = cache(
  async (tenantId: string, limit = 8) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return db
      .select({
        id: observabilityLogs.id,
        applicationId: observabilityLogs.applicationId,
        requestId: observabilityLogs.requestId,
        timestamp: observabilityLogs.timestamp,
        path: observabilityLogs.path,
        statusCode: observabilityLogs.statusCode,
        guardrailResults: observabilityLogs.guardrailResults,
      })
      .from(observabilityLogs)
      .where(
        and(
          eq(observabilityLogs.tenantId, tenantId),
          gte(observabilityLogs.timestamp, since),
          sql`(
      ${observabilityLogs.guardrailResults}->'_summary'->>'was_blocked' = 'true'
      or ${observabilityLogs.guardrailResults}->>'policy_decision' = 'block'
      or ${observabilityLogs.guardrailResults}->>'blocked' = 'true'
    )`,
        ),
      )
      .orderBy(desc(observabilityLogs.timestamp))
      .limit(limit);
  },
);

export const getExecutiveDashboard = cache(async (tenantId: string) => {
  const [cards, autonomy, platforms, trend, agentViolations, recentViolations] =
    await Promise.all([
      getDashboardCards(tenantId),
      getAutonomyDistribution(tenantId),
      getPlatformDistribution(tenantId),
      getDiscoveryTrend(tenantId),
      getAgentPolicyViolations(tenantId, 500),
      getRecentViolations(tenantId),
    ]);
  // Rows behind each KPI card, so a card can list exactly which agents it counts.
  const agentList = (await getProfiles(tenantId))
    .map((r) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      framework: r.profile.framework,
      level: r.autonomy.level,
      reason: r.autonomy.reason,
      running: r.profile.deployed,
      deployed: isEverDeployed(r.profile),
      stopped: !r.profile.deployed && Boolean(r.profile.deployedAt),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { cards, autonomy, platforms, trend, agentViolations, recentViolations, agentList };
});
