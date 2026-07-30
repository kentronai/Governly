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
  normalizeCrewAIBaseUrl,
  type CrewAICredentials,
  type CrewAIDirectCredentials,
} from "./api-client";

/** The integration row that stores a CrewAI connection. */
export interface CrewAIConnection {
  id: string;
  name: string;
  configuration: unknown;
  credentialsEncrypted: string | null;
  // Set when the connection is backed by self-hosted Nango instead of a
  // NORIX-stored token.
  nangoConnectionId?: string | null;
  nangoProviderConfigKey?: string | null;
}

/**
 * A deployed crew as returned by GET /crewai_plus/api/v1/crews. Verified
 * against the live API; parsed defensively for forward-compatibility.
 * Example: { uuid, name, status: "Crew is Online", state: "Successful",
 *   description, public_url, token, error_message, tags: [] }
 */
interface CrewAICrewRaw {
  uuid?: string;
  id?: string | number;
  name?: string;
  status?: string;
  state?: string;
  description?: string;
  public_url?: string;
  error_message?: string | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function parseCrewAICredentials(
  connection: CrewAIConnection,
): CrewAICredentials {
  const config = (connection.configuration ?? {}) as Record<string, unknown>;

  // Nango-backed: the token lives in the Nango vault; we only need the API base
  // (defaults to the managed cloud). The credential is injected by Nango.
  if (connection.nangoConnectionId && connection.nangoProviderConfigKey) {
    const rawBase =
      typeof config.baseUrl === "string" && config.baseUrl.trim()
        ? normalizeCrewAIBaseUrl(config.baseUrl)
        : CREWAI_DEFAULT_BASE_URL;
    return {
      mode: "nango",
      baseUrl: rawBase,
      connectionId: connection.nangoConnectionId,
      providerConfigKey: connection.nangoProviderConfigKey,
    };
  }

  if (!connection.credentialsEncrypted) {
    throw new Error("CrewAI connection has no stored credentials");
  }
  let parsed: Partial<CrewAIDirectCredentials>;
  try {
    parsed = JSON.parse(
      decryptSecret(connection.credentialsEncrypted),
    ) as Partial<CrewAIDirectCredentials>;
  } catch {
    throw new Error("Stored CrewAI credentials could not be decrypted");
  }
  const accessToken = parsed.accessToken?.trim();
  if (!accessToken) throw new Error("CrewAI access token is missing");
  return {
    mode: "direct",
    baseUrl: parsed.baseUrl?.trim() || CREWAI_DEFAULT_BASE_URL,
    accessToken,
  };
}

/** Verifies the token by listing crews; a 200 (even empty) means the PAT is
 * valid for this organization. */
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
    await crewaiApi(credentials, CREWAI_ENDPOINTS.crews);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function readCrews(payload: unknown): CrewAICrewRaw[] {
  if (Array.isArray(payload)) return payload as CrewAICrewRaw[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["crews", "data", "results", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as CrewAICrewRaw[];
    }
  }
  return [];
}

// CrewAI reports health in `status` (e.g. "Crew is Online") and `state`
// (e.g. "Successful"); anything else, or a non-empty error_message, is inactive.
function isCrewActive(crew: CrewAICrewRaw): boolean {
  if (crew.error_message) return false;
  const status = (crew.status ?? "").toLowerCase();
  const state = (crew.state ?? "").toLowerCase();
  return status.includes("online") || state === "successful";
}

/**
 * Maps one deployed crew to a CorrelatedAgent. A crew is an autonomous
 * multi-agent runtime (execute-capable); its public deployment URL is a public
 * endpoint. Tool/permission evidence is not exposed by the crews listing, so
 * classification stays at the evidence-backed floor rather than inventing it.
 */
function toCorrelatedAgent(crew: CrewAICrewRaw, baseHost: string): CorrelatedAgent {
  const externalAgentId = String(
    crew.uuid ?? crew.id ?? crew.name ?? crypto.randomUUID(),
  );
  const name = crew.name || `CrewAI crew ${externalAgentId}`;
  const tags = (crew.tags ?? []).reduce<Record<string, string>>((acc, t) => {
    acc[t] = "true";
    return acc;
  }, {});

  const crewResource: RawDiscoveredResource = {
    resourceType: "crewai_crew",
    resourceId: externalAgentId,
    resourceArn: null,
    resourceName: name,
    region: "crewai",
    tags,
    createdAt: crew.created_at ?? null,
    lastUpdatedAt: crew.updated_at ?? null,
    metadata: {
      providerStatus: crew.status ?? crew.state ?? "unknown",
      description: crew.description ?? null,
      publicUrl: crew.public_url ?? null,
      publicNetworkAccess: crew.public_url ? "Enabled" : "Disabled",
      errorMessage: crew.error_message ?? null,
      baseHost,
    },
  };

  return {
    externalAgentId,
    name,
    platform: "crewai",
    region: "crewai",
    discoverySource: "crewai_crew",
    resources: [crewResource],
  };
}

export async function discoverCrewAI(credentials: CrewAICredentials): Promise<{
  crews: CrewAICrewRaw[];
  agents: CorrelatedAgent[];
  baseHost: string;
}> {
  const baseHost = new URL(credentials.baseUrl).hostname;
  const payload = await crewaiApi<unknown>(credentials, CREWAI_ENDPOINTS.crews);
  const crews = readCrews(payload);
  return {
    crews,
    agents: crews.map((c) => toCorrelatedAgent(c, baseHost)),
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

    for (let i = 0; i < discovery.agents.length; i += 1) {
      const agent = discovery.agents[i];
      const crew = discovery.crews[i];
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
      const providerInactive = !isCrewActive(crew);
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
        resourcesScanned: { crewai_crew: discovery.agents.length },
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
      resourcesScanned: { crewai_crew: discovery.agents.length },
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
