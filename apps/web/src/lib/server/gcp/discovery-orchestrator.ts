import { createSign } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  agentRecommendations,
  agentResources,
  agents,
  db,
  discoveryScans,
  integrations,
} from "@db";
import { decryptSecret } from "@/lib/server/crypto";
import type {
  DiscoveredResourceType,
  RawDiscoveredResource,
} from "@/lib/server/aws/discovery/types";
import type { CorrelatedAgent } from "@/lib/server/aws/correlation";
import { buildCapabilityFacts } from "@/lib/server/agents/capability-engine";
import { classifyAutonomy } from "@/lib/server/agents/autonomy-engine";
import { assessRisk } from "@/lib/server/agents/risk-engine";
import { detectOwnership } from "@/lib/server/agents/ownership-engine";
import { generateRecommendations } from "@/lib/server/agents/recommendations-engine";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";

export interface GoogleServiceAccount {
  type?: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  token_uri?: string;
}

interface GoogleCloudConnection {
  id: string;
  credentialsEncrypted: string | null;
  configuration: unknown;
}

interface GoogleAsset {
  name?: string;
  assetType?: string;
  project?: string;
  displayName?: string;
  description?: string;
  location?: string;
  labels?: Record<string, string>;
  additionalAttributes?: Record<string, unknown>;
  createTime?: string;
  updateTime?: string;
}

const GOOGLE_ASSET_TYPES = [
  "aiplatform.googleapis.com/ReasoningEngine",
  "run.googleapis.com/Service",
  "compute.googleapis.com/Instance",
  "container.googleapis.com/Cluster",
  "cloudfunctions.googleapis.com/CloudFunction",
];
const AI_SIGNAL =
  /(^|[-_:/.])(ai|agent|llm|genai|copilot|assistant|langchain|crewai|autogen)([-_:/.]|$)/i;

function encode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function parseServiceAccount(encrypted: string | null): GoogleServiceAccount {
  if (!encrypted) throw new Error("Google Cloud credentials are missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptSecret(encrypted));
  } catch {
    throw new Error("Stored Google Cloud service account JSON is invalid");
  }
  const value = parsed as Partial<GoogleServiceAccount>;
  if (!value.project_id || !value.client_email || !value.private_key) {
    throw new Error(
      "Service account JSON must include project_id, client_email, and private_key",
    );
  }
  return value as GoogleServiceAccount;
}

export async function getGoogleAccessToken(
  account: GoogleServiceAccount,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || "https://oauth2.googleapis.com/token";
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encode(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${encode(signer.sign(account.private_key))}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google authentication failed: ${
        payload.error_description || payload.error || response.statusText
      }`,
    );
  }
  return payload.access_token;
}

function projectId(
  connection: GoogleCloudConnection,
  account: GoogleServiceAccount,
) {
  const configured = connection.configuration as { projectId?: string } | null;
  return configured?.projectId || account.project_id;
}

export async function testGoogleCloudConnection(
  connection: GoogleCloudConnection,
) {
  try {
    const account = parseServiceAccount(connection.credentialsEncrypted);
    const token = await getGoogleAccessToken(account);
    const id = projectId(connection, account);
    const response = await fetch(
      `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      displayName?: string;
      state?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(
        payload.error?.message || `Google API HTTP ${response.status}`,
      );
    }
    return {
      ok: true as const,
      projectId: id,
      displayName: payload.displayName || id,
      state: payload.state || "ACTIVE",
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Google Cloud connection failed",
    };
  }
}

function hasAgentSignal(asset: GoogleAsset): boolean {
  if (AI_SIGNAL.test(asset.displayName || asset.name || "")) return true;
  if (AI_SIGNAL.test(asset.description || "")) return true;
  return Object.entries(asset.labels ?? {}).some(
    ([key, value]) =>
      (AI_SIGNAL.test(key) ||
        ["ai", "ai-agent", "agent", "norix-agent"].includes(
          key.toLowerCase(),
        )) &&
      value.toLowerCase() !== "false" &&
      value.toLowerCase() !== "disabled",
  );
}

function resourceType(assetType: string): DiscoveredResourceType | null {
  const types: Record<string, DiscoveredResourceType> = {
    "aiplatform.googleapis.com/ReasoningEngine": "gcp_vertex_reasoning_engine",
    "run.googleapis.com/Service": "gcp_cloud_run_service",
    "compute.googleapis.com/Instance": "gcp_compute_instance",
    "container.googleapis.com/Cluster": "gcp_gke_cluster",
    "cloudfunctions.googleapis.com/CloudFunction": "gcp_cloud_function",
  };
  return types[assetType] ?? null;
}

function platformFor(
  type: DiscoveredResourceType,
): CorrelatedAgent["platform"] {
  const platforms: Partial<
    Record<DiscoveredResourceType, CorrelatedAgent["platform"]>
  > = {
    gcp_vertex_reasoning_engine: "gcp_vertex_ai",
    gcp_cloud_run_service: "gcp_cloud_run",
    gcp_compute_instance: "gcp_compute",
    gcp_gke_cluster: "gcp_gke",
    gcp_cloud_function: "gcp_functions",
  };
  return platforms[type] ?? "other";
}

export async function discoverGoogleCloudResources(
  connection: GoogleCloudConnection,
): Promise<RawDiscoveredResource[]> {
  const account = parseServiceAccount(connection.credentialsEncrypted);
  const token = await getGoogleAccessToken(account);
  const id = projectId(connection, account);
  const assets: GoogleAsset[] = [];
  const searchErrors: string[] = [];

  // Search types separately: Google may introduce an asset type in one API
  // before Cloud Asset supports it. One unsupported type must not hide all
  // otherwise discoverable workloads.
  for (const assetType of GOOGLE_ASSET_TYPES) {
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        pageSize: "500",
        assetTypes: assetType,
      });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await fetch(
        `https://cloudasset.googleapis.com/v1/projects/${encodeURIComponent(
          id,
        )}:searchAllResources?${query}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        results?: GoogleAsset[];
        nextPageToken?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        searchErrors.push(
          `${assetType}: ${
            payload.error?.message || `HTTP ${response.status}`
          }`,
        );
        break;
      }
      assets.push(...(payload.results ?? []));
      pageToken = payload.nextPageToken;
    } while (pageToken);
  }
  if (searchErrors.length === GOOGLE_ASSET_TYPES.length) {
    throw new Error(`Cloud Asset Inventory failed: ${searchErrors.join("; ")}`);
  }

  return assets.flatMap((asset): RawDiscoveredResource[] => {
    const type = resourceType(asset.assetType || "");
    if (!type || !asset.name) return [];
    const nativeAgent = type === "gcp_vertex_reasoning_engine";
    if (!nativeAgent && !hasAgentSignal(asset)) return [];
    return [
      {
        resourceType: type,
        resourceId: asset.name,
        resourceArn: asset.name,
        resourceName:
          asset.displayName || asset.name.split("/").at(-1) || asset.name,
        region: asset.location || "global",
        tags: asset.labels ?? {},
        createdAt: asset.createTime ?? null,
        lastUpdatedAt: asset.updateTime ?? null,
        metadata: {
          ...(asset.additionalAttributes ?? {}),
          evidenceSource: "gcp_cloud_asset_inventory",
          assetType: asset.assetType,
          project: asset.project || id,
          description: asset.description || null,
          hasWrite: true,
          discoveryQualification: nativeAgent
            ? "Native Vertex AI Agent Engine resource."
            : "Name, description, or labels explicitly identify this workload as an AI agent.",
        },
      },
    ];
  });
}

function correlate(resources: RawDiscoveredResource[]): CorrelatedAgent[] {
  return resources.map((resource) => ({
    externalAgentId: resource.resourceId,
    name: resource.resourceName,
    platform: platformFor(resource.resourceType),
    region: resource.region,
    discoverySource: resource.resourceType,
    resources: [resource],
  }));
}

export async function runGoogleCloudDiscoveryScan(
  tenantId: string,
  integrationId: string,
  connection: GoogleCloudConnection,
  triggeredBy: string | null,
) {
  const [scan] = await db
    .insert(discoveryScans)
    .values({
      tenantId,
      connectionId: null,
      azureConnectionId: null,
      integrationId,
      status: "running",
      startedAt: new Date().toISOString(),
      triggeredBy,
    })
    .returning();
  try {
    const account = parseServiceAccount(connection.credentialsEncrypted);
    const resources = await discoverGoogleCloudResources(connection);
    const correlated = correlate(resources);
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
          eq(agents.integrationId, integrationId),
          eq(agents.externalAgentId, agent.externalAgentId),
        ),
      });
      const values = {
        tenantId,
        connectionId: null,
        azureConnectionId: null,
        integrationId,
        externalAgentId: agent.externalAgentId,
        name: agent.name,
        platform: agent.platform,
        region: agent.region,
        accountId: projectId(connection, account),
        model: null,
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
          provider: "google_cloud",
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
      .update(integrations)
      .set({
        lastSyncAt: now,
        syncStatus: "success",
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(integrations.id, integrationId));
    return {
      scanId: scan.id,
      status: "completed" as const,
      agentsDiscovered: correlated.length,
      resourcesScanned: resourceCounts,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Cloud discovery failed";
    const now = new Date().toISOString();
    await db
      .update(discoveryScans)
      .set({ status: "failed", finishedAt: now, errorMessage: message })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(integrations)
      .set({
        lastSyncAt: now,
        syncStatus: "failed",
        errorMessage: message,
        updatedAt: now,
      })
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
