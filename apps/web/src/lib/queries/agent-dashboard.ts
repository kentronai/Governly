/** Live, tenant-scoped analytics for the Agent Registry module. */
import {
  db,
  agents,
  awsDiscoveryConnections,
  azureDiscoveryConnections,
  discoveryScans,
  observabilityLogs,
  reports,
  tenants,
} from "@db";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { cache } from "react";

const AUTONOMY_LEVELS = ["L1", "L2", "L3", "L4"] as const;
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;

export const resolveAgentDiscoveryTenantId = cache(async (slugOrId: string) => {
  const [byId] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, slugOrId))
    .limit(1);
  if (byId) return byId.id;
  const [bySlug] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slugOrId))
    .limit(1);
  if (!bySlug) throw new Error("Tenant not found");
  return bySlug.id;
});

export const getDashboardCards = cache(async (tenantId: string) => {
  const [row] = await db
    .select({
      total: count(),
      critical: sql<number>`count(*) filter (where ${agents.riskLevel} = 'Critical')`,
      high: sql<number>`count(*) filter (where ${agents.riskLevel} = 'High')`,
      withoutOwner: sql<number>`count(*) filter (where ${agents.ownerUserId} is null)`,
      dormant: sql<number>`count(*) filter (where ${agents.status} = 'dormant')`,
    })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));
  return Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [key, Number(value ?? 0)]),
  ) as {
    total: number;
    critical: number;
    high: number;
    withoutOwner: number;
    dormant: number;
  };
});

export const getAutonomyDistribution = cache(async (tenantId: string) => {
  const rows = await db
    .select({ level: agents.autonomyLevel, value: count() })
    .from(agents)
    .where(eq(agents.tenantId, tenantId))
    .groupBy(agents.autonomyLevel);
  const values = new Map(rows.map((row) => [row.level, Number(row.value)]));
  return AUTONOMY_LEVELS.map((level) => ({
    level,
    count: values.get(level) ?? 0,
  }));
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
  db.query.agents.findMany({
    where: eq(agents.tenantId, tenantId),
    orderBy: [desc(agents.firstSeenAt)],
    limit,
    columns: {
      id: true,
      name: true,
      platform: true,
      autonomyLevel: true,
      autonomyReason: true,
      autonomyConfidence: true,
      autonomyClassifiedAt: true,
      riskLevel: true,
      riskScore: true,
      riskFactors: true,
      firstSeenAt: true,
    },
    with: {
      agentRecommendations: {
        columns: { id: true, reason: true, suggestedFix: true, severity: true },
        limit: 1,
      },
    },
  }),
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
  const [
    awsConnections,
    azureConnections,
    latestScan,
    autonomy,
    ownership,
    [ownerSources],
    [lastExport],
  ] = await Promise.all([
    db
      .select({
        id: awsDiscoveryConnections.id,
        name: awsDiscoveryConnections.name,
        region: awsDiscoveryConnections.region,
        enabled: awsDiscoveryConnections.isEnabled,
        lastValidatedAt: awsDiscoveryConnections.lastValidatedAt,
        error: awsDiscoveryConnections.lastValidationError,
      })
      .from(awsDiscoveryConnections)
      .where(eq(awsDiscoveryConnections.tenantId, tenantId))
      .orderBy(desc(awsDiscoveryConnections.createdAt)),
    db
      .select({
        id: azureDiscoveryConnections.id,
        name: azureDiscoveryConnections.name,
        region: azureDiscoveryConnections.subscriptionId,
        enabled: azureDiscoveryConnections.isEnabled,
        lastValidatedAt: azureDiscoveryConnections.lastValidatedAt,
        error: azureDiscoveryConnections.lastValidationError,
      })
      .from(azureDiscoveryConnections)
      .where(eq(azureDiscoveryConnections.tenantId, tenantId))
      .orderBy(desc(azureDiscoveryConnections.createdAt)),
    db
      .select()
      .from(discoveryScans)
      .where(eq(discoveryScans.tenantId, tenantId))
      .orderBy(desc(discoveryScans.createdAt))
      .limit(1),
    getAutonomyDistribution(tenantId),
    getOwnershipBreakdown(tenantId),
    db
      .select({
        suggested: sql<number>`count(*) filter (where ${agents.ownerSource} like 'ai:%')`,
        manual: sql<number>`count(*) filter (where ${agents.ownerSource} = 'manual')`,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId)),
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
  const connections = [
    ...awsConnections.map((item) => ({ ...item, provider: "AWS" as const })),
    ...azureConnections.map((item) => ({
      ...item,
      provider: "Azure" as const,
    })),
  ];
  const scan = latestScan[0] ?? null;
  const resourceCounts =
    scan?.resourcesScanned && typeof scan.resourcesScanned === "object"
      ? Object.values(
          scan.resourcesScanned as Record<string, unknown>,
        ).reduce<number>((sum, value) => sum + Number(value || 0), 0)
      : 0;
  const durationMs =
    scan?.startedAt && scan?.finishedAt
      ? new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime()
      : null;
  const owned = ownership.find((item) => item.label === "Owned")?.count ?? 0;
  const unowned =
    ownership.find((item) => item.label === "Unowned")?.count ?? 0;
  return {
    connect: {
      connected: connections.some((item) => item.enabled && !item.error),
      connectedAccounts: connections.length,
      lastAuthentication:
        connections.find((item) => item.lastValidatedAt)?.lastValidatedAt ??
        null,
      connections,
    },
    discover: {
      status: scan?.status ?? "not_started",
      lastScan: scan?.finishedAt ?? scan?.startedAt ?? null,
      agentsDiscovered: scan?.agentsDiscovered ?? 0,
      resourcesScanned: resourceCounts,
      durationMs,
      error: scan?.errorMessage ?? null,
    },
    classify: {
      levels: autonomy,
      classified: autonomy.reduce((sum, item) => sum + item.count, 0),
      completed:
        scan?.status === "completed" &&
        autonomy.reduce((sum, item) => sum + item.count, 0) === owned + unowned,
    },
    own: {
      owned,
      unowned,
      aiSuggested: Number(ownerSources?.suggested ?? 0),
      manual: Number(ownerSources?.manual ?? 0),
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
  const [
    cards,
    autonomy,
    ownership,
    credentialTypes,
    platforms,
    riskLevels,
    recentAgents,
    trend,
    recentViolations,
  ] = await Promise.all([
    getDashboardCards(tenantId),
    getAutonomyDistribution(tenantId),
    getOwnershipBreakdown(tenantId),
    getCredentialTypeBreakdown(tenantId),
    getPlatformDistribution(tenantId),
    getRiskLevelBreakdown(tenantId),
    getRecentAgents(tenantId),
    getDiscoveryTrend(tenantId),
    getRecentViolations(tenantId),
  ]);
  return {
    cards,
    autonomy,
    ownership,
    credentialTypes,
    platforms,
    riskLevels,
    recentAgents,
    trend,
    recentViolations,
  };
});
