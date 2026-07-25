import https from "node:https";
import { URL } from "node:url";
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
import type { RawDiscoveredResource } from "@/lib/server/aws/discovery/types";
import type { CorrelatedAgent } from "@/lib/server/aws/correlation";
import { buildCapabilityFacts } from "@/lib/server/agents/capability-engine";
import { classifyAutonomy } from "@/lib/server/agents/autonomy-engine";
import { assessRisk } from "@/lib/server/agents/risk-engine";
import { detectOwnership } from "@/lib/server/agents/ownership-engine";
import { generateRecommendations } from "@/lib/server/agents/recommendations-engine";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";

interface KubernetesConnection {
  id: string;
  credentialsEncrypted: string | null;
  configuration: unknown;
}

type KubernetesAgentPlatform =
  | "aws_eks"
  | "azure_aks"
  | "gcp_gke"
  | "kubernetes";

interface KubernetesCredentials {
  provider?: string;
  clusterName: string;
  apiServer: string;
  bearerToken: string;
  caCertificate?: string;
}

type KubernetesWorkloadKind =
  | "Deployment"
  | "StatefulSet"
  | "DaemonSet"
  | "Job"
  | "Pod"
  | "Service";

interface KubernetesList<T> {
  items?: T[];
}

interface KubernetesWorkload {
  kind?: KubernetesWorkloadKind;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: Array<{
      kind?: string;
      name?: string;
      controller?: boolean;
    }>;
    creationTimestamp?: string;
  };
  spec?: {
    replicas?: number;
    selector?:
      | {
          matchLabels?: Record<string, string>;
        }
      | Record<string, string>;
    template?: {
      metadata?: {
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
      };
      spec?: PodSpec;
    };
  } & PodSpec;
  status?: {
    readyReplicas?: number;
    availableReplicas?: number;
    active?: number;
    succeeded?: number;
    phase?: string;
  };
}

interface PodSpec {
  serviceAccountName?: string;
  containers?: Array<{
    name?: string;
    image?: string;
    env?: Array<{ name?: string }>;
    ports?: Array<{ containerPort?: number }>;
  }>;
}

interface KubernetesNode {
  metadata?: {
    labels?: Record<string, string>;
  };
  spec?: {
    providerID?: string;
  };
}

const AI_SIGNAL =
  /(^|[-_:/.])(ai|agent|llm|genai|copilot|assistant|langchain|crewai|autogen|semantic-kernel)([-_:/.]|$)/i;

function parseCredentials(encrypted: string | null): KubernetesCredentials {
  if (!encrypted) throw new Error("Kubernetes credentials are missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptSecret(encrypted));
  } catch {
    throw new Error("Stored Kubernetes credentials are invalid");
  }

  const value = parsed as Partial<KubernetesCredentials>;
  if (!value.clusterName || !value.apiServer || !value.bearerToken) {
    throw new Error(
      "Kubernetes credentials must include clusterName, apiServer, and bearerToken",
    );
  }

  return {
    provider: "kubernetes",
    clusterName: value.clusterName,
    apiServer: value.apiServer.replace(/\/+$/, ""),
    bearerToken: value.bearerToken,
    caCertificate: value.caCertificate?.trim() || undefined,
  };
}

function classifyHttpError(status: number, message: string, path: string) {
  if (status === 401) {
    return `Kubernetes token is invalid or expired while calling ${path}.`;
  }
  if (status === 403) {
    return `Kubernetes token is valid, but RBAC does not allow ${path}. Grant read-only list/get permissions for namespaces, nodes, pods, services, deployments, statefulsets, daemonsets, and jobs.`;
  }
  if (status === 404) {
    return `Kubernetes API path ${path} was not found. Check the API server URL.`;
  }
  return message || `Kubernetes API ${path} failed with ${status}`;
}

async function kubeFetch<T>(
  credentials: KubernetesCredentials,
  path: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const url = new URL(path, credentials.apiServer);
    const request = https.request(
      url,
      {
        method: "GET",
        ca: credentials.caCertificate,
        timeout: 20_000,
        headers: {
          Authorization: `Bearer ${credentials.bearerToken}`,
          Accept: "application/json",
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          let payload: { message?: string };
          try {
            payload = body ? (JSON.parse(body) as { message?: string }) : {};
          } catch {
            reject(new Error(`Kubernetes API ${path} returned invalid JSON`));
            return;
          }
          if ((response.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                classifyHttpError(
                  response.statusCode ?? 500,
                  payload.message || response.statusMessage || "",
                  path,
                ),
              ),
            );
            return;
          }
          resolve(payload as T);
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(
        new Error(
          "Kubernetes API request timed out. Check network, VPN, firewall, or whether the cluster endpoint is private.",
        ),
      );
    });
    request.on("error", (error: NodeJS.ErrnoException) => {
      const message = error.message || "";
      const code = error.code || "";
      if (
        code.includes("CERT") ||
        code.includes("UNABLE_TO_VERIFY") ||
        /certificate|issuer|self-signed/i.test(message)
      ) {
        reject(
          new Error(
            "Kubernetes API TLS verification failed. Add the cluster CA certificate for this API server.",
          ),
        );
        return;
      }
      if (
        code === "ETIMEDOUT" ||
        code === "ENOTFOUND" ||
        code === "ECONNREFUSED" ||
        code === "EHOSTUNREACH"
      ) {
        reject(
          new Error(
            `Kubernetes API is not reachable from NORIX (${code}). Check URL, network, VPN, firewall, or private endpoint access.`,
          ),
        );
        return;
      }
      reject(new Error(`Kubernetes API request failed: ${message}`));
    });
    request.end();
  }).catch((error) => {
    if (
      error instanceof SyntaxError ||
      /Unexpected token|JSON/i.test((error as Error).message)
    ) {
      throw new Error(`Kubernetes API ${path} returned invalid JSON`);
    }
    throw error;
  });
}

function entries(workload: KubernetesWorkload) {
  return {
    labels: {
      ...(workload.metadata?.labels ?? {}),
      ...(workload.spec?.template?.metadata?.labels ?? {}),
    },
    annotations: {
      ...(workload.metadata?.annotations ?? {}),
      ...(workload.spec?.template?.metadata?.annotations ?? {}),
    },
    containers:
      workload.spec?.template?.spec?.containers ??
      workload.spec?.containers ??
      [],
  };
}

function hasAgentSignal(workload: KubernetesWorkload): boolean {
  const { labels, annotations, containers } = entries(workload);
  const text = [
    workload.kind,
    workload.metadata?.name,
    workload.metadata?.namespace,
    ...containers.flatMap((container) => [container.name, container.image]),
  ]
    .filter(Boolean)
    .join(" ");
  if (AI_SIGNAL.test(text)) return true;

  return Object.entries({ ...labels, ...annotations }).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    const normalizedValue = String(value).toLowerCase();
    if (
      [
        "norix.ai/agent",
        "norix:agent",
        "ai-agent",
        "agent",
        "app.kubernetes.io/component",
      ].includes(normalizedKey) &&
      !["false", "disabled", "0", "no"].includes(normalizedValue)
    ) {
      return true;
    }
    return AI_SIGNAL.test(key) || AI_SIGNAL.test(String(value));
  });
}

function detectKubernetesProvider(nodes: KubernetesNode[]) {
  const providerText = nodes
    .flatMap((node) => [
      node.spec?.providerID,
      ...Object.entries(node.metadata?.labels ?? {}).flatMap(([key, value]) => [
        key,
        value,
      ]),
    ])
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (providerText.includes("aws://") || providerText.includes("eks")) {
    return "EKS";
  }
  if (providerText.includes("azure://") || providerText.includes("aks")) {
    return "AKS";
  }
  if (providerText.includes("gce://") || providerText.includes("gke")) {
    return "GKE";
  }
  return "Generic Kubernetes";
}

function toResource(
  clusterName: string,
  workload: KubernetesWorkload,
): RawDiscoveredResource | null {
  if (!workload.metadata?.name || !workload.metadata.namespace) return null;
  const { labels, annotations, containers } = entries(workload);
  if (!hasAgentSignal(workload)) return null;

  const kind = workload.kind ?? "Pod";
  const namespace = workload.metadata.namespace;
  const name = workload.metadata.name;
  const id = `${clusterName}/${namespace}/${kind}/${name}`;

  return {
    resourceType: "kubernetes_workload",
    resourceId: id,
    resourceArn: id,
    resourceName: name,
    region: namespace,
    tags: labels,
    createdAt: workload.metadata.creationTimestamp ?? null,
    lastUpdatedAt: null,
    metadata: {
      evidenceSource: "kubernetes_api",
      clusterName,
      namespace,
      kind,
      uid: workload.metadata.uid ?? null,
      labels,
      annotations,
      ownerReferences: workload.metadata.ownerReferences ?? [],
      selector:
        typeof workload.spec?.selector === "object"
          ? "matchLabels" in workload.spec.selector
            ? workload.spec.selector.matchLabels
            : workload.spec.selector
          : {},
      serviceAccountName:
        workload.spec?.template?.spec?.serviceAccountName ??
        workload.spec?.serviceAccountName ??
        null,
      containerImages: containers.map((container) => container.image),
      environmentKeys: containers.flatMap((container) =>
        (container.env ?? []).map((env) => env.name).filter(Boolean),
      ),
      ports: containers.flatMap((container) =>
        (container.ports ?? [])
          .map((port) => port.containerPort)
          .filter((port): port is number => typeof port === "number"),
      ),
      replicas: workload.spec?.replicas ?? null,
      status: workload.status ?? {},
      discoveryQualification:
        "Name, labels, annotations, or container image explicitly identify this Kubernetes workload as an AI agent.",
    },
  };
}

async function listWorkloads(credentials: KubernetesCredentials) {
  const [deployments, statefulSets, daemonSets, jobs, pods, services] =
    await Promise.all([
      kubeFetch<KubernetesList<KubernetesWorkload>>(
        credentials,
        "/apis/apps/v1/deployments",
      ),
      kubeFetch<KubernetesList<KubernetesWorkload>>(
        credentials,
        "/apis/apps/v1/statefulsets",
      ),
      kubeFetch<KubernetesList<KubernetesWorkload>>(
        credentials,
        "/apis/apps/v1/daemonsets",
      ),
      kubeFetch<KubernetesList<KubernetesWorkload>>(
        credentials,
        "/apis/batch/v1/jobs",
      ),
      kubeFetch<KubernetesList<KubernetesWorkload>>(
        credentials,
        "/api/v1/pods",
      ),
      kubeFetch<KubernetesList<KubernetesWorkload>>(
        credentials,
        "/api/v1/services",
      ),
    ]);

  return [
    ...(deployments.items ?? []).map((item) => ({
      ...item,
      kind: "Deployment" as const,
    })),
    ...(statefulSets.items ?? []).map((item) => ({
      ...item,
      kind: "StatefulSet" as const,
    })),
    ...(daemonSets.items ?? []).map((item) => ({
      ...item,
      kind: "DaemonSet" as const,
    })),
    ...(jobs.items ?? []).map((item) => ({ ...item, kind: "Job" as const })),
    ...(pods.items ?? []).map((item) => ({ ...item, kind: "Pod" as const })),
    ...(services.items ?? []).map((item) => ({
      ...item,
      kind: "Service" as const,
    })),
  ];
}

export async function testKubernetesConnection(
  connection: KubernetesConnection,
) {
  try {
    const credentials = parseCredentials(connection.credentialsEncrypted);
    const version = await kubeFetch<{ gitVersion?: string }>(
      credentials,
      "/version",
    );
    const nodes = await kubeFetch<KubernetesList<KubernetesNode>>(
      credentials,
      "/api/v1/nodes",
    );
    await kubeFetch<KubernetesList<{ metadata?: { name?: string } }>>(
      credentials,
      "/api/v1/namespaces",
    );
    await kubeFetch<KubernetesList<{ metadata?: { name?: string } }>>(
      credentials,
      "/api/v1/services",
    );
    return {
      ok: true as const,
      clusterName: credentials.clusterName,
      version: version.gitVersion ?? "unknown",
      providerType: detectKubernetesProvider(nodes.items ?? []),
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Kubernetes connection failed",
    };
  }
}

const APP_LABEL_KEYS = [
  "app.kubernetes.io/instance",
  "app.kubernetes.io/name",
  "app",
  "k8s-app",
  "name",
];

function metadata(resource: RawDiscoveredResource) {
  return resource.metadata as {
    clusterName?: string;
    namespace?: string;
    kind?: KubernetesWorkloadKind;
    labels?: Record<string, string>;
    selector?: Record<string, string>;
    ownerReferences?: Array<{
      kind?: string;
      name?: string;
      controller?: boolean;
    }>;
  };
}

function appLabel(labels: Record<string, string> | undefined) {
  for (const key of APP_LABEL_KEYS) {
    const value = labels?.[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function deploymentNameFromReplicaSet(name: string | undefined) {
  if (!name) return undefined;
  const match = name.match(/^(.+)-[a-f0-9]{8,10}$/i);
  return match?.[1] ?? name;
}

function workloadNameFromPod(resource: RawDiscoveredResource) {
  const meta = metadata(resource);
  const controller = meta.ownerReferences?.find((owner) => owner.controller);
  if (controller?.kind === "ReplicaSet") {
    return deploymentNameFromReplicaSet(controller.name);
  }
  if (
    controller?.kind === "Deployment" ||
    controller?.kind === "StatefulSet" ||
    controller?.kind === "DaemonSet" ||
    controller?.kind === "Job"
  ) {
    return controller.name;
  }
  const generatedDeploymentPod = resource.resourceName.match(
    /^(.+)-[a-f0-9]{8,10}-[a-z0-9]{5}$/i,
  );
  if (generatedDeploymentPod) return generatedDeploymentPod[1];
  const statefulSetPod = resource.resourceName.match(/^(.+)-\d+$/);
  return statefulSetPod?.[1];
}

function groupKey(resource: RawDiscoveredResource) {
  const meta = metadata(resource);
  const namespace = meta.namespace ?? resource.region;
  const clusterName = meta.clusterName ?? "kubernetes";
  const kind = meta.kind;

  const selectorLabel = appLabel(meta.selector);
  if (selectorLabel) return `${clusterName}/${namespace}/app/${selectorLabel}`;

  const label = appLabel(resource.tags);
  if (label) return `${clusterName}/${namespace}/app/${label}`;

  if (kind === "Pod") {
    const ownerName = workloadNameFromPod(resource);
    if (ownerName) return `${clusterName}/${namespace}/workload/${ownerName}`;
  }

  return `${clusterName}/${namespace}/workload/${resource.resourceName}`;
}

function resourcePriority(resource: RawDiscoveredResource) {
  const kind = metadata(resource).kind;
  if (kind === "Deployment") return 0;
  if (kind === "StatefulSet") return 1;
  if (kind === "DaemonSet") return 2;
  if (kind === "Job") return 3;
  if (kind === "Pod") return 4;
  if (kind === "Service") return 5;
  return 6;
}

export function correlateKubernetesResources(
  resources: RawDiscoveredResource[],
  platform: KubernetesAgentPlatform = "kubernetes",
): CorrelatedAgent[] {
  const groups = new Map<string, RawDiscoveredResource[]>();
  for (const resource of resources) {
    const key = groupKey(resource);
    groups.set(key, [...(groups.get(key) ?? []), resource]);
  }

  return Array.from(groups.values()).map((group) => {
    const sorted = [...group].sort(
      (a, b) => resourcePriority(a) - resourcePriority(b),
    );
    const primary = sorted[0];
    return {
      externalAgentId: primary.resourceId,
      name: primary.resourceName,
      platform,
      region: primary.region,
      discoverySource: "kubernetes_workload",
      resources: sorted,
    };
  });
}

function platformFromConfiguration(
  configuration: unknown,
): KubernetesAgentPlatform {
  const providerType =
    typeof configuration === "object" && configuration !== null
      ? String(
          (configuration as Record<string, unknown>).providerType ?? "",
        ).toLowerCase()
      : "";
  if (providerType === "eks") return "aws_eks";
  if (providerType === "aks") return "azure_aks";
  if (providerType === "gke") return "gcp_gke";
  return "kubernetes";
}

export async function runKubernetesDiscoveryScan(
  tenantId: string,
  integrationId: string,
  connection: KubernetesConnection,
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
    const credentials = parseCredentials(connection.credentialsEncrypted);
    const workloads = await listWorkloads(credentials);
    const resources = workloads.flatMap((workload) => {
      const resource = toResource(credentials.clusterName, workload);
      return resource ? [resource] : [];
    });
    const platform = platformFromConfiguration(connection.configuration);
    const correlated = correlateKubernetesResources(resources, platform);
    const seenExternalIds = correlated.map((agent) => agent.externalAgentId);
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
        accountId: credentials.clusterName,
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
          provider: "kubernetes",
          platform,
          providerType:
            typeof connection.configuration === "object" &&
            connection.configuration !== null
              ? ((connection.configuration as Record<string, unknown>)
                  .providerType ?? null)
              : null,
          clusterName: credentials.clusterName,
        },
        updatedAt: now,
      };

      const agentId = existing
        ? existing.id
        : (
            await db
              .insert(agents)
              .values({ ...values, firstSeenAt: now })
              .returning({ id: agents.id })
          )[0].id;
      if (existing) {
        await db.update(agents).set(values).where(eq(agents.id, existing.id));
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

    const staleWhere =
      seenExternalIds.length > 0
        ? and(
            eq(agents.integrationId, integrationId),
            notInArray(agents.externalAgentId, seenExternalIds),
          )
        : eq(agents.integrationId, integrationId);
    await db.delete(agents).where(staleWhere);

    const resourceCounts = {
      kubernetes_workload: resources.length,
      kubernetes_pod: workloads.filter((item) => item.kind === "Pod").length,
      kubernetes_deployment: workloads.filter(
        (item) => item.kind === "Deployment",
      ).length,
      kubernetes_statefulset: workloads.filter(
        (item) => item.kind === "StatefulSet",
      ).length,
      kubernetes_daemonset: workloads.filter(
        (item) => item.kind === "DaemonSet",
      ).length,
      kubernetes_job: workloads.filter((item) => item.kind === "Job").length,
      kubernetes_service: workloads.filter((item) => item.kind === "Service")
        .length,
    };

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
        configuration: {
          ...((connection.configuration as Record<string, unknown>) ?? {}),
          lastAgentsDiscovered: correlated.length,
          lastDiscoveryCounts: resourceCounts,
        },
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
      error instanceof Error ? error.message : "Kubernetes discovery failed";
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
