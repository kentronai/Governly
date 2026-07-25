/**
 * Discovers agents a customer has deployed on the CrewAI Enterprise / AMP
 * platform and persists them as NORIX agents, running the same capability /
 * autonomy / risk / ownership engines used by every other provider so a CrewAI
 * crew is governed identically to an AWS or Databricks agent.
 *
 * Each CrewAI deployment (a running crew) becomes one logical agent.
 */

import { and, eq, notInArray } from "drizzle-orm";
import {
  agentRecommendations,
  agentResources,
  agents,
  db,
  discoveryScans,
  integrations,
} from "@db";
import { decryptSecret } from "@/lib/server/crypto";
import { buildCapabilityFacts } from "@/lib/server/agents/capability-engine";
import { classifyAutonomy } from "@/lib/server/agents/autonomy-engine";
import { assessRisk } from "@/lib/server/agents/risk-engine";
import { detectOwnership } from "@/lib/server/agents/ownership-engine";
import { generateRecommendations } from "@/lib/server/agents/recommendations-engine";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";
import type { CorrelatedAgent } from "@/lib/server/aws/correlation";
import type { RawDiscoveredResource } from "@/lib/server/aws/discovery/types";
import {
  CREWAI_DEFAULT_BASE_URL,
  CREWAI_ENDPOINTS,
  crewaiApi,
  type CrewAICredentials,
} from "./api-client";

/** The integration row that stores a CrewAI connection. */
export interface CrewAIConnection {
  id: string;
  name: string;
  configuration: unknown;
  credentialsEncrypted: string | null;
}

/** Shape of a CrewAI deployment as returned by the platform API. Parsed
 * defensively because field names vary across CrewAI API versions. */
interface CrewAIDeploymentRaw {
  uuid?: string;
  id?: string | number;
  name?: string;
  display_name?: string;
  status?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  crew?: {
    name?: string;
    agents?: Array<{ role?: string; name?: string }>;
    tasks?: Array<{ name?: string; description?: string }>;
    tools?: string[];
  };
  agents?: Array<{ role?: string; name?: string }>;
  tools?: string[];
  environment_variables?: Record<string, unknown> | string[];
  [key: string]: unknown;
}

export function parseCrewAICredentials(
  connection: CrewAIConnection,
): CrewAICredentials {
  if (!connection.credentialsEncrypted) {
    throw new Error("CrewAI connection has no stored credentials");
  }
  let parsed: Partial<CrewAICredentials>;
  try {
    parsed = JSON.parse(
      decryptSecret(connection.credentialsEncrypted),
    ) as Partial<CrewAICredentials>;
  } catch {
    throw new Error("Stored CrewAI credentials could not be decrypted");
  }
  const accessToken = parsed.accessToken?.trim();
  if (!accessToken) throw new Error("CrewAI access token is missing");
  return {
    baseUrl: parsed.baseUrl?.trim() || CREWAI_DEFAULT_BASE_URL,
    accessToken,
  };
}

/** Verifies the token by identifying the caller. Falls back to the deployments
 * listing when the identity endpoint is unavailable. */
export async function testCrewAIConnection(
  connection: CrewAIConnection,
): Promise<{ ok: boolean; error?: string; organization?: string }> {
  let credentials: CrewAICredentials;
  try {
    credentials = parseCrewAICredentials(connection);
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  try {
    const me = await crewaiApi<{
      organization?: { name?: string };
      organization_name?: string;
      email?: string;
    }>(credentials, CREWAI_ENDPOINTS.me);
    return {
      ok: true,
      organization:
        me.organization?.name || me.organization_name || me.email,
    };
  } catch (identityError) {
    // Some org tokens can list deployments without access to /me — treat a
    // successful deployments call as a valid connection.
    try {
      await crewaiApi(credentials, CREWAI_ENDPOINTS.deployments);
      return { ok: true };
    } catch {
      return { ok: false, error: (identityError as Error).message };
    }
  }
}

function readDeployments(payload: unknown): CrewAIDeploymentRaw[] {
  if (Array.isArray(payload)) return payload as CrewAIDeploymentRaw[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["deployments", "results", "data", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as CrewAIDeploymentRaw[];
    }
  }
  return [];
}

const INACTIVE_STATES = new Set([
  "stopped",
  "failed",
  "error",
  "inactive",
  "deleted",
  "archived",
  "not_deployed",
]);

/**
 * Maps one CrewAI deployment to a CorrelatedAgent. Capability metadata is
 * derived only from what the deployment payload actually exposes (tools,
 * environment variables, member agents) so classification stays evidence-based.
 */
function toCorrelatedAgent(
  deployment: CrewAIDeploymentRaw,
  baseHost: string,
): CorrelatedAgent {
  const externalAgentId = String(
    deployment.uuid ?? deployment.id ?? deployment.name ?? crypto.randomUUID(),
  );
  const name =
    deployment.name ||
    deployment.display_name ||
    deployment.crew?.name ||
    `CrewAI deployment ${externalAgentId}`;

  const tools = deployment.crew?.tools ?? deployment.tools ?? [];
  const memberAgents = deployment.crew?.agents ?? deployment.agents ?? [];
  const tasks = deployment.crew?.tasks ?? [];
  const envVars = Array.isArray(deployment.environment_variables)
    ? deployment.environment_variables
    : Object.keys(deployment.environment_variables ?? {});

  // A crew with tools can call out and act; expose that as capability evidence.
  const hasTools = tools.length > 0;

  const deploymentResource: RawDiscoveredResource = {
    resourceType: "crewai_deployment",
    resourceId: externalAgentId,
    resourceArn: null,
    resourceName: name,
    region: "crewai",
    tags: {},
    createdAt: deployment.created_at ?? null,
    lastUpdatedAt: deployment.updated_at ?? null,
    metadata: {
      providerStatus: deployment.status ?? deployment.state ?? "unknown",
      hasWrite: hasTools,
      environmentKeys: envVars,
      toolCount: tools.length,
      tools,
      agentRoles: memberAgents.map((a) => a.role || a.name).filter(Boolean),
      taskCount: tasks.length,
      baseHost,
    },
  };

  const crewResource: RawDiscoveredResource = {
    resourceType: "crewai_crew",
    resourceId: `${externalAgentId}:crew`,
    resourceArn: null,
    resourceName: deployment.crew?.name || name,
    region: "crewai",
    tags: {},
    createdAt: deployment.created_at ?? null,
    lastUpdatedAt: deployment.updated_at ?? null,
    metadata: {
      memberAgentCount: memberAgents.length,
      hasWrite: hasTools,
    },
  };

  return {
    externalAgentId,
    name,
    platform: "crewai",
    region: "crewai",
    discoverySource: "crewai_deployment",
    resources: [deploymentResource, crewResource],
  };
}

export async function discoverCrewAI(credentials: CrewAICredentials): Promise<{
  agents: CorrelatedAgent[];
  baseHost: string;
}> {
  const baseHost = new URL(credentials.baseUrl).hostname;
  const payload = await crewaiApi<unknown>(
    credentials,
    CREWAI_ENDPOINTS.deployments,
  );
  const deployments = readDeployments(payload);
  return {
    agents: deployments.map((d) => toCorrelatedAgent(d, baseHost)),
    baseHost,
  };
}

export async function runCrewAIDiscoveryScan(
  tenantId: string,
  integrationId: string,
  connection: CrewAIConnection,
  triggeredBy: string | null,
) {
  const [scan] = await db
    .insert(discoveryScans)
    .values({
      tenantId,
      integrationId,
      status: "running",
      startedAt: new Date().toISOString(),
      triggeredBy,
    })
    .returning();

  try {
    const credentials = parseCrewAICredentials(connection);
    const discovery = await discoverCrewAI(credentials);
    const now = new Date().toISOString();
    const seenExternalIds: string[] = [];

    for (const agent of discovery.agents) {
      seenExternalIds.push(agent.externalAgentId);
      const ownership = await detectOwnership(agent);
      const facts = buildCapabilityFacts(agent, ownership.ownerUserId);
      const autonomy = await classifyAutonomy(tenantId, facts);
      const risk = await assessRisk(tenantId, facts);
      const recommendations = generateRecommendations(
        facts,
        autonomy,
        ownership,
      );
      const existing = await db.query.agents.findFirst({
        where: and(
          eq(agents.integrationId, integrationId),
          eq(agents.externalAgentId, agent.externalAgentId),
        ),
      });
      const providerStatus = String(
        agent.resources[0]?.metadata.providerStatus ?? "",
      ).toLowerCase();
      const providerInactive = INACTIVE_STATES.has(providerStatus);
      const values = {
        tenantId,
        connectionId: null,
        azureConnectionId: null,
        integrationId,
        externalAgentId: agent.externalAgentId,
        name: agent.name,
        platform: agent.platform,
        region: agent.region,
        accountId: discovery.baseHost,
        model: null,
        knowledgeBaseId: null,
        iamRoleArn: null,
        credentialType: null,
        ownerUserId: ownership.ownerUserId,
        ownerSource: ownership.ownerSource,
        ownerConfidence: String(ownership.ownerConfidence),
        businessFunction: ownership.businessFunction,
        status: (providerInactive
          ? "inactive"
          : facts.isDormant
            ? "dormant"
            : "active") as "inactive" | "dormant" | "active",
        lastUsedAt: null,
        capabilities: facts,
        autonomyLevel: autonomy.level,
        autonomyReason: autonomy.reason,
        autonomyEvidence: autonomy.evidence,
        autonomyConfidence: String(autonomy.confidence),
        autonomyClassifiedAt: now,
        riskScore: String(risk.score),
        riskLevel: risk.level,
        riskFactors: risk.factors,
        discoverySource: agent.discoverySource,
        lastSeenAt: now,
        syncStatus: "success" as const,
        rawMetadata: {
          provider: "crewai",
          baseHost: discovery.baseHost,
          resourceCount: agent.resources.length,
          evidenceSource: "crewai_enterprise_api",
        },
        updatedAt: now,
      };
      let agentId: string;
      if (existing) {
        agentId = existing.id;
        await db.update(agents).set(values).where(eq(agents.id, existing.id));
      } else {
        const [created] = await db
          .insert(agents)
          .values({ ...values, firstSeenAt: now })
          .returning();
        agentId = created.id;
      }
      await db
        .delete(agentResources)
        .where(eq(agentResources.agentId, agentId));
      await db.insert(agentResources).values(
        agent.resources.map((item) => ({
          tenantId,
          agentId,
          resourceType: item.resourceType,
          resourceArn: item.resourceArn,
          resourceName: item.resourceName,
          region: item.region,
          rawData: {
            ...item.metadata,
            tags: item.tags,
            createdAt: item.createdAt,
            lastUpdatedAt: item.lastUpdatedAt,
          },
        })),
      );
      await db
        .delete(agentRecommendations)
        .where(
          and(
            eq(agentRecommendations.agentId, agentId),
            eq(agentRecommendations.status, "open"),
          ),
        );
      if (recommendations.length) {
        await db.insert(agentRecommendations).values(
          recommendations.map((item) => ({
            tenantId,
            agentId,
            recommendationType: item.recommendationType,
            reason: item.reason,
            severity: item.severity,
            suggestedFix: item.suggestedFix,
          })),
        );
      }
      await syncAgentPolicyEvaluations(tenantId, agentId);
    }

    // Retire agents that no longer exist in CrewAI.
    if (seenExternalIds.length > 0) {
      await db
        .update(agents)
        .set({ status: "inactive", syncStatus: "success", updatedAt: now })
        .where(
          and(
            eq(agents.integrationId, integrationId),
            notInArray(agents.externalAgentId, seenExternalIds),
          ),
        );
    } else {
      await db
        .update(agents)
        .set({ status: "inactive", syncStatus: "success", updatedAt: now })
        .where(eq(agents.integrationId, integrationId));
    }

    await db
      .update(discoveryScans)
      .set({
        status: "completed",
        finishedAt: now,
        agentsDiscovered: discovery.agents.length,
        resourcesScanned: { crewai_deployment: discovery.agents.length },
        errorMessage: null,
      })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(integrations)
      .set({
        isEnabled: true,
        isCredentialsAdded: true,
        lastSyncAt: now,
        syncStatus: "success",
        errorMessage: null,
        configuration: {
          baseUrl: credentials.baseUrl,
          authentication: "bearer_token",
          lastAgentsDiscovered: discovery.agents.length,
        },
        updatedAt: now,
      })
      .where(eq(integrations.id, integrationId));

    return {
      scanId: scan.id,
      status: "completed" as const,
      agentsDiscovered: discovery.agents.length,
      resourcesScanned: { crewai_deployment: discovery.agents.length },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "CrewAI discovery failed";
    await db
      .update(discoveryScans)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        errorMessage: message,
      })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(integrations)
      .set({ syncStatus: "failed", errorMessage: message })
      .where(eq(integrations.id, integrationId));
    return {
      scanId: scan.id,
      status: "failed" as const,
      agentsDiscovered: 0,
      resourcesScanned: {},
      errorMessage: message,
    };
  }
}
