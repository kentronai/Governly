import { and, eq } from "drizzle-orm";
import {
  agentRecommendations,
  agentResources,
  agents,
  azureDiscoveryConnections,
  db,
  discoveryScans,
} from "@db";
import { decryptSecret } from "@/lib/server/crypto";
import type { RawDiscoveredResource } from "@/lib/server/aws/discovery/types";
import { buildCapabilityFacts } from "@/lib/server/agents/capability-engine";
import { classifyAutonomy } from "@/lib/server/agents/autonomy-engine";
import { assessRisk } from "@/lib/server/agents/risk-engine";
import { detectOwnership } from "@/lib/server/agents/ownership-engine";
import { generateRecommendations } from "@/lib/server/agents/recommendations-engine";
import {
  correlateAzureResources,
  normalizeAzureResources,
  type AzureGraphResource,
} from "./resource-normalizer";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";

export interface AzureConnectionRecord {
  azureTenantId: string;
  subscriptionId: string;
  clientId: string;
  encryptedClientSecret: string;
}

async function parseAzureResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
    access_token?: string;
  };
  if (!response.ok)
    throw new Error(
      `Azure ${payload.error?.code ?? response.status}: ${payload.error?.message ?? response.statusText}`,
    );
  return payload;
}

export async function getAzureAccessToken(
  connection: AzureConnectionRecord,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: connection.clientId,
    client_secret: decryptSecret(connection.encryptedClientSecret),
    grant_type: "client_credentials",
    scope: "https://management.azure.com/.default",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(connection.azureTenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );
  const payload = await parseAzureResponse(response);
  if (!payload.access_token)
    throw new Error("Azure authentication succeeded without an access token");
  return payload.access_token;
}

export async function testAzureConnection(connection: AzureConnectionRecord) {
  try {
    const token = await getAzureAccessToken(connection);
    const response = await fetch(
      `https://management.azure.com/subscriptions/${encodeURIComponent(connection.subscriptionId)}?api-version=2022-12-01`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = (await parseAzureResponse(response)) as {
      displayName?: string;
      state?: string;
    };
    return {
      ok: true as const,
      subscriptionId: connection.subscriptionId,
      displayName: payload.displayName ?? connection.subscriptionId,
      state: payload.state ?? "Unknown",
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Azure connection failed",
    };
  }
}

export async function discoverAzureResources(
  connection: AzureConnectionRecord,
): Promise<RawDiscoveredResource[]> {
  const token = await getAzureAccessToken(connection);
  const query = `Resources
| where subscriptionId =~ '${connection.subscriptionId.replaceAll("'", "''")}'
| where type in~ ('microsoft.cognitiveservices/accounts','microsoft.machinelearningservices/workspaces','microsoft.web/sites','microsoft.logic/workflows','microsoft.managedidentity/userassignedidentities','microsoft.storage/storageaccounts','microsoft.keyvault/vaults','microsoft.apimanagement/service','microsoft.compute/virtualmachines','microsoft.app/containerapps','microsoft.containerservice/managedclusters')
| project id, name, type, kind, location, resourceGroup, tags, properties`;
  const data: AzureGraphResource[] = [];
  let skipToken: string | undefined;
  do {
    const response = await fetch(
      "https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptions: [connection.subscriptionId],
          query,
          options: {
            resultFormat: "objectArray",
            $top: 1000,
            ...(skipToken ? { $skipToken: skipToken } : {}),
          },
        }),
        cache: "no-store",
      },
    );
    const payload = (await parseAzureResponse(response)) as unknown as {
      data?: AzureGraphResource[];
      $skipToken?: string;
      skipToken?: string;
    };
    data.push(...(Array.isArray(payload.data) ? payload.data : []));
    skipToken = payload["$skipToken"] ?? payload.skipToken;
  } while (skipToken);

  return normalizeAzureResources(data);
}

export async function runAzureDiscoveryScan(
  tenantId: string,
  connectionId: string,
  connection: AzureConnectionRecord,
  triggeredBy: string | null,
) {
  const [scan] = await db
    .insert(discoveryScans)
    .values({
      tenantId,
      connectionId: null,
      azureConnectionId: connectionId,
      status: "running",
      startedAt: new Date().toISOString(),
      triggeredBy,
    })
    .returning();
  try {
    const resources = await discoverAzureResources(connection);
    const correlated = correlateAzureResources(resources);
    const now = new Date().toISOString();
    for (const agent of correlated) {
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
          eq(agents.azureConnectionId, connectionId),
          eq(agents.externalAgentId, agent.externalAgentId),
        ),
      });
      const values = {
        tenantId,
        connectionId: null,
        azureConnectionId: connectionId,
        externalAgentId: agent.externalAgentId,
        name: agent.name,
        platform: agent.platform,
        region: agent.region,
        accountId: connection.subscriptionId,
        model:
          (agent.resources.find(
            (resource) => resource.resourceType === "azure_openai_account",
          )?.metadata.kind as string) ?? null,
        knowledgeBaseId: null,
        iamRoleArn: null,
        credentialType: "service_account" as const,
        ownerUserId: ownership.ownerUserId,
        ownerSource: ownership.ownerSource,
        ownerConfidence: String(ownership.ownerConfidence),
        businessFunction: ownership.businessFunction,
        status: (facts.isDormant ? "dormant" : "active") as
          | "dormant"
          | "active",
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
          resourceCount: agent.resources.length,
          provider: "azure",
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
      if (agent.resources.length)
        await db
          .insert(agentResources)
          .values(
            agent.resources.map((resource) => ({
              tenantId,
              agentId,
              resourceType: resource.resourceType,
              resourceArn: resource.resourceArn,
              resourceName: resource.resourceName,
              region: resource.region,
              rawData: resource.metadata,
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
      if (recommendations.length)
        await db
          .insert(agentRecommendations)
          .values(
            recommendations.map((item) => ({
              tenantId,
              agentId,
              recommendationType: item.recommendationType,
              reason: item.reason,
              severity: item.severity,
              suggestedFix: item.suggestedFix,
            })),
          );
      await syncAgentPolicyEvaluations(tenantId, agentId);
    }
    const resourceCounts = resources.reduce<Record<string, number>>(
      (result, resource) => ({
        ...result,
        [resource.resourceType]: (result[resource.resourceType] ?? 0) + 1,
      }),
      {},
    );
    await db
      .update(discoveryScans)
      .set({
        status: "completed",
        finishedAt: now,
        agentsDiscovered: correlated.length,
        resourcesScanned: resourceCounts,
      })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(azureDiscoveryConnections)
      .set({
        lastScanAt: now,
        lastScanStatus: "completed",
        lastScanSummary: {
          agentsDiscovered: correlated.length,
          resourcesScanned: resourceCounts,
        },
        updatedAt: now,
      })
      .where(eq(azureDiscoveryConnections.id, connectionId));
    return {
      scanId: scan.id,
      status: "completed" as const,
      agentsDiscovered: correlated.length,
      resourcesScanned: resourceCounts,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Azure discovery failed";
    const now = new Date().toISOString();
    await db
      .update(discoveryScans)
      .set({ status: "failed", finishedAt: now, errorMessage: message })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(azureDiscoveryConnections)
      .set({
        lastScanAt: now,
        lastScanStatus: "failed",
        lastScanSummary: { error: message },
        updatedAt: now,
      })
      .where(eq(azureDiscoveryConnections.id, connectionId));
    return {
      scanId: scan.id,
      status: "failed" as const,
      agentsDiscovered: 0,
      resourcesScanned: {},
      errorMessage: message,
    };
  }
}
