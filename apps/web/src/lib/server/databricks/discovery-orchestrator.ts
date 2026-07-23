import { and, eq, notInArray } from "drizzle-orm";
import {
  agentRecommendations,
  agentResources,
  agents,
  db,
  discoveryScans,
  integrationDiscoveredResources,
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
import {
  databricksApi,
  fetchDatabricksPages,
  normalizeDatabricksHost,
  type DatabricksCredentials,
} from "./api-client";

export { normalizeDatabricksHost } from "./api-client";

export interface DatabricksConnection {
  id: string;
  credentialsEncrypted: string | null;
  configuration: unknown;
}

interface DatabricksIdentity {
  id?: string;
  userName?: string;
  displayName?: string;
  active?: boolean;
}

interface Catalog {
  name: string;
  comment?: string;
  owner?: string;
  metastore_id?: string;
  catalog_type?: string;
  created_at?: number;
  updated_at?: number;
  properties?: Record<string, string>;
}

interface Schema {
  name: string;
  full_name?: string;
  catalog_name: string;
  comment?: string;
  owner?: string;
  schema_id?: string;
  created_at?: number;
  updated_at?: number;
  properties?: Record<string, string>;
}

interface Table {
  name: string;
  full_name?: string;
  catalog_name: string;
  schema_name: string;
  comment?: string;
  owner?: string;
  table_id?: string;
  table_type?: string;
  data_source_format?: string;
  created_at?: number;
  updated_at?: number;
  properties?: Record<string, string>;
}

interface RegisteredModel {
  name: string;
  full_name?: string;
  catalog_name: string;
  schema_name: string;
  comment?: string;
  owner?: string;
  metastore_id?: string;
  created_at?: number;
  updated_at?: number;
  aliases?: Array<{ alias_name?: string; version_num?: number }>;
}

interface ServedEntity {
  entity_name?: string;
  entity_version?: string;
  name?: string;
  workload_type?: string;
  workload_size?: string;
  scale_to_zero_enabled?: boolean;
  external_model?: { name?: string; provider?: string; task?: string };
}

interface ServingEndpoint {
  id?: string;
  name: string;
  creator?: string;
  creation_timestamp?: number;
  last_updated_timestamp?: number;
  state?: { ready?: string; config_update?: string };
  config?: {
    served_entities?: ServedEntity[];
    served_models?: ServedEntity[];
    traffic_config?: unknown;
    auto_capture_config?: { catalog_name?: string; schema_name?: string };
  };
  tags?: Array<{ key?: string; value?: string }>;
  ai_gateway?: unknown;
  route_optimized?: boolean;
}

export interface DatabricksDiscovery {
  identity: DatabricksIdentity;
  catalogs: Catalog[];
  schemas: Schema[];
  tables: Table[];
  models: RegisteredModel[];
  endpoints: ServingEndpoint[];
  agents: CorrelatedAgent[];
  counts: Record<string, number>;
}

const AI_SIGNAL =
  /(^|[-_:/.])(ai|agent|llm|genai|copilot|assistant|langchain|crewai|autogen)([-_:/.]|$)/i;

function parseCredentials(
  connection: DatabricksConnection,
): DatabricksCredentials {
  if (!connection.credentialsEncrypted) {
    throw new Error("Databricks credentials are missing");
  }
  let parsed: Partial<DatabricksCredentials>;
  try {
    parsed = JSON.parse(
      decryptSecret(connection.credentialsEncrypted),
    ) as Partial<DatabricksCredentials>;
  } catch {
    throw new Error("Stored Databricks credentials are invalid");
  }
  if (!parsed.hostUrl || !parsed.accessToken) {
    throw new Error(
      "Stored Databricks workspace URL or access token is missing",
    );
  }
  return {
    hostUrl: normalizeDatabricksHost(parsed.hostUrl),
    accessToken: parsed.accessToken,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await mapper(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function tags(endpoint: ServingEndpoint): Record<string, string> {
  return Object.fromEntries(
    (endpoint.tags ?? []).flatMap((tag) =>
      tag.key ? [[tag.key, tag.value ?? ""]] : [],
    ),
  );
}

function hasAgentSignal(value: {
  name?: string;
  full_name?: string;
  comment?: string;
  properties?: Record<string, string>;
}): boolean {
  if (AI_SIGNAL.test(value.full_name || value.name || "")) return true;
  if (AI_SIGNAL.test(value.comment || "")) return true;
  return Object.entries(value.properties ?? {}).some(
    ([key, item]) =>
      AI_SIGNAL.test(key) ||
      (["norix.agent", "ai.agent", "agent"].includes(key.toLowerCase()) &&
        !["false", "disabled", "0"].includes(item.toLowerCase())),
  );
}

function iso(epoch?: number): string | null {
  return epoch ? new Date(epoch).toISOString() : null;
}

function resource(
  resourceType: DiscoveredResourceType,
  id: string,
  name: string,
  metadata: Record<string, unknown>,
  createdAt?: number,
  updatedAt?: number,
  resourceTags: Record<string, string> = {},
): RawDiscoveredResource {
  return {
    resourceType,
    resourceId: id,
    resourceArn: id,
    resourceName: name,
    region: "workspace",
    tags: resourceTags,
    createdAt: iso(createdAt),
    lastUpdatedAt: iso(updatedAt),
    metadata: {
      ...metadata,
      evidenceSource: "databricks_rest_api",
    },
  };
}

function relatedResources(
  model: RegisteredModel,
  catalogs: Map<string, Catalog>,
  schemas: Map<string, Schema>,
  tables: Table[],
): RawDiscoveredResource[] {
  const fullName =
    model.full_name ||
    `${model.catalog_name}.${model.schema_name}.${model.name}`;
  const output = [
    resource(
      "databricks_registered_model",
      `databricks:model:${fullName}`,
      fullName,
      {
        owner: model.owner,
        comment: model.comment,
        aliases: model.aliases ?? [],
        hasWrite: true,
        discoveryQualification:
          "Unity Catalog registered model matched a serving endpoint or explicit AI-agent metadata.",
      },
      model.created_at,
      model.updated_at,
    ),
  ];
  const catalog = catalogs.get(model.catalog_name);
  if (catalog) {
    output.push(
      resource(
        "databricks_catalog",
        `databricks:catalog:${catalog.name}`,
        catalog.name,
        { owner: catalog.owner, catalogType: catalog.catalog_type },
        catalog.created_at,
        catalog.updated_at,
      ),
    );
  }
  const schemaKey = `${model.catalog_name}.${model.schema_name}`;
  const schema = schemas.get(schemaKey);
  if (schema) {
    output.push(
      resource(
        "databricks_schema",
        `databricks:schema:${schemaKey}`,
        schemaKey,
        { owner: schema.owner, comment: schema.comment },
        schema.created_at,
        schema.updated_at,
      ),
    );
  }
  for (const table of tables.filter(
    (item) =>
      item.catalog_name === model.catalog_name &&
      item.schema_name === model.schema_name &&
      hasAgentSignal(item),
  )) {
    const tableName =
      table.full_name ||
      `${table.catalog_name}.${table.schema_name}.${table.name}`;
    output.push(
      resource(
        "databricks_table",
        `databricks:table:${tableName}`,
        tableName,
        {
          owner: table.owner,
          comment: table.comment,
          tableType: table.table_type,
          dataSourceFormat: table.data_source_format,
          discoveryQualification:
            "Table metadata explicitly identifies it as an AI-agent resource.",
        },
        table.created_at,
        table.updated_at,
      ),
    );
  }
  return output;
}

function correlate(discovery: Omit<DatabricksDiscovery, "agents" | "counts">) {
  const catalogMap = new Map(
    discovery.catalogs.map((catalog) => [catalog.name, catalog]),
  );
  const schemaMap = new Map(
    discovery.schemas.map((schema) => [
      schema.full_name || `${schema.catalog_name}.${schema.name}`,
      schema,
    ]),
  );
  const modelMap = new Map(
    discovery.models.map((model) => [
      model.full_name ||
        `${model.catalog_name}.${model.schema_name}.${model.name}`,
      model,
    ]),
  );
  const agentsFound: CorrelatedAgent[] = [];
  const servedModelNames = new Set<string>();

  for (const endpoint of discovery.endpoints) {
    const entities = [
      ...(endpoint.config?.served_entities ?? []),
      ...(endpoint.config?.served_models ?? []),
    ];
    const endpointResource = resource(
      "databricks_serving_endpoint",
      `databricks:serving-endpoint:${endpoint.id || endpoint.name}`,
      endpoint.name,
      {
        endpointId: endpoint.id,
        creator: endpoint.creator,
        state: endpoint.state,
        trafficConfig: endpoint.config?.traffic_config,
        autoCaptureConfig: endpoint.config?.auto_capture_config,
        aiGateway: endpoint.ai_gateway,
        routeOptimized: endpoint.route_optimized,
        servedEntities: entities,
        hasWrite: true,
        publicNetworkAccess: "Enabled",
        discoveryQualification:
          "Native Databricks Model Serving endpoint returned by the workspace API.",
      },
      endpoint.creation_timestamp,
      endpoint.last_updated_timestamp,
      tags(endpoint),
    );
    const matchedModels = entities.flatMap((entity) => {
      const name = entity.entity_name;
      if (!name) return [];
      servedModelNames.add(name);
      const model = modelMap.get(name);
      return model
        ? relatedResources(model, catalogMap, schemaMap, discovery.tables)
        : [];
    });
    agentsFound.push({
      externalAgentId: endpointResource.resourceId,
      name: endpoint.name,
      platform: "databricks_model_serving",
      region: "workspace",
      discoverySource: "databricks_serving_endpoint",
      resources: [
        endpointResource,
        ...new Map(
          matchedModels.map((item) => [item.resourceId, item]),
        ).values(),
      ],
    });
  }

  for (const model of discovery.models) {
    const fullName =
      model.full_name ||
      `${model.catalog_name}.${model.schema_name}.${model.name}`;
    if (servedModelNames.has(fullName) || !hasAgentSignal(model)) continue;
    agentsFound.push({
      externalAgentId: `databricks:model:${fullName}`,
      name: fullName,
      platform: "databricks_unity_catalog",
      region: "workspace",
      discoverySource: "databricks_registered_model",
      resources: relatedResources(
        model,
        catalogMap,
        schemaMap,
        discovery.tables,
      ),
    });
  }
  return agentsFound;
}

export async function testDatabricksConnection(
  connection: DatabricksConnection,
) {
  try {
    const credentials = parseCredentials(connection);
    const [identity, catalogResult, endpointResult] = await Promise.all([
      databricksApi<DatabricksIdentity>(
        credentials,
        "/api/2.0/preview/scim/v2/Me",
      ),
      fetchDatabricksPages<Catalog>(
        credentials,
        "/api/2.1/unity-catalog/catalogs",
        "catalogs",
      ),
      databricksApi<{ endpoints?: ServingEndpoint[] }>(
        credentials,
        "/api/2.0/serving-endpoints",
      ),
    ]);
    return {
      ok: true as const,
      workspaceHost: new URL(credentials.hostUrl).hostname,
      principal: identity.userName || identity.displayName || identity.id,
      catalogsVisible: catalogResult.length,
      servingEndpointsVisible: endpointResult.endpoints?.length ?? 0,
    };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Databricks connection failed",
    };
  }
}

export async function discoverDatabricks(
  connection: DatabricksConnection,
): Promise<DatabricksDiscovery> {
  const credentials = parseCredentials(connection);
  const [identity, catalogs, models, endpointResult] = await Promise.all([
    databricksApi<DatabricksIdentity>(
      credentials,
      "/api/2.0/preview/scim/v2/Me",
    ),
    fetchDatabricksPages<Catalog>(
      credentials,
      "/api/2.1/unity-catalog/catalogs",
      "catalogs",
    ),
    fetchDatabricksPages<RegisteredModel>(
      credentials,
      "/api/2.1/unity-catalog/models",
      "registered_models",
    ),
    databricksApi<{ endpoints?: ServingEndpoint[] }>(
      credentials,
      "/api/2.0/serving-endpoints",
    ),
  ]);
  const schemas = (
    await mapWithConcurrency(catalogs, 5, (catalog) =>
      fetchDatabricksPages<Schema>(
        credentials,
        "/api/2.1/unity-catalog/schemas",
        "schemas",
        { catalog_name: catalog.name },
      ),
    )
  ).flat();
  const tables = (
    await mapWithConcurrency(schemas, 5, (schema) =>
      fetchDatabricksPages<Table>(
        credentials,
        "/api/2.1/unity-catalog/tables",
        "tables",
        {
          catalog_name: schema.catalog_name,
          schema_name: schema.name,
          omit_columns: "true",
          omit_properties: "false",
        },
      ),
    )
  ).flat();
  const endpoints = endpointResult.endpoints ?? [];
  const discovered = { identity, catalogs, schemas, tables, models, endpoints };
  const foundAgents = correlate(discovered);
  return {
    ...discovered,
    agents: foundAgents,
    counts: {
      databricks_catalog: catalogs.length,
      databricks_schema: schemas.length,
      databricks_table: tables.length,
      databricks_registered_model: models.length,
      databricks_serving_endpoint: endpoints.length,
    },
  };
}

async function persistUnityCatalogInventory(
  tenantId: string,
  integrationId: string,
  discovery: DatabricksDiscovery,
  now: string,
) {
  const existing = await db
    .select({
      externalResourceId: integrationDiscoveredResources.externalResourceId,
      firstSeenAt: integrationDiscoveredResources.firstSeenAt,
    })
    .from(integrationDiscoveredResources)
    .where(eq(integrationDiscoveredResources.integrationId, integrationId));
  const firstSeen = new Map(
    existing.map((item) => [item.externalResourceId, item.firstSeenAt]),
  );
  const rows = [
    ...discovery.catalogs.map((item) => ({
      externalResourceId: `databricks:catalog:${item.name}`,
      resourceType: "databricks_catalog",
      resourceName: item.name,
      parentResourceId: null,
      metadata: item,
    })),
    ...discovery.schemas.map((item) => {
      const fullName = item.full_name || `${item.catalog_name}.${item.name}`;
      return {
        externalResourceId: `databricks:schema:${fullName}`,
        resourceType: "databricks_schema",
        resourceName: fullName,
        parentResourceId: `databricks:catalog:${item.catalog_name}`,
        metadata: item,
      };
    }),
    ...discovery.tables.map((item) => {
      const fullName =
        item.full_name ||
        `${item.catalog_name}.${item.schema_name}.${item.name}`;
      return {
        externalResourceId: `databricks:table:${fullName}`,
        resourceType: "databricks_table",
        resourceName: fullName,
        parentResourceId: `databricks:schema:${item.catalog_name}.${item.schema_name}`,
        metadata: item,
      };
    }),
    ...discovery.models.map((item) => {
      const fullName =
        item.full_name ||
        `${item.catalog_name}.${item.schema_name}.${item.name}`;
      return {
        externalResourceId: `databricks:model:${fullName}`,
        resourceType: "databricks_registered_model",
        resourceName: fullName,
        parentResourceId: `databricks:schema:${item.catalog_name}.${item.schema_name}`,
        metadata: item,
      };
    }),
    ...discovery.endpoints.map((item) => ({
      externalResourceId: `databricks:serving-endpoint:${item.id || item.name}`,
      resourceType: "databricks_serving_endpoint",
      resourceName: item.name,
      parentResourceId: null,
      metadata: item,
    })),
  ];

  await db.transaction(async (tx) => {
    await tx
      .delete(integrationDiscoveredResources)
      .where(eq(integrationDiscoveredResources.integrationId, integrationId));
    for (let index = 0; index < rows.length; index += 200) {
      const page = rows.slice(index, index + 200);
      await tx.insert(integrationDiscoveredResources).values(
        page.map((item) => ({
          tenantId,
          integrationId,
          provider: "databricks",
          ...item,
          firstSeenAt: firstSeen.get(item.externalResourceId) || now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  });
}

export async function runDatabricksDiscoveryScan(
  tenantId: string,
  integrationId: string,
  connection: DatabricksConnection,
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
    const discovery = await discoverDatabricks(connection);
    const credentials = parseCredentials(connection);
    const workspaceHost = new URL(credentials.hostUrl).hostname;
    const now = new Date().toISOString();
    const seenExternalIds: string[] = [];
    await persistUnityCatalogInventory(tenantId, integrationId, discovery, now);

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
      const modelResource = agent.resources.find(
        (item) => item.resourceType === "databricks_registered_model",
      );
      const values = {
        tenantId,
        connectionId: null,
        azureConnectionId: null,
        integrationId,
        externalAgentId: agent.externalAgentId,
        name: agent.name,
        platform: agent.platform,
        region: agent.region,
        accountId: workspaceHost,
        model: modelResource?.resourceName ?? null,
        knowledgeBaseId: null,
        iamRoleArn: null,
        credentialType: null,
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
          provider: "databricks",
          workspaceHost,
          principal:
            discovery.identity.userName ||
            discovery.identity.displayName ||
            discovery.identity.id,
          resourceCount: agent.resources.length,
          evidenceSource: "databricks_rest_api",
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
      if (agent.resources.length) {
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
      }
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
    await db
      .update(agents)
      .set({ status: "inactive", syncStatus: "success", updatedAt: now })
      .where(staleWhere);

    await db
      .update(discoveryScans)
      .set({
        status: "completed",
        finishedAt: now,
        agentsDiscovered: discovery.agents.length,
        resourcesScanned: discovery.counts,
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
          lastDiscoveryCounts: discovery.counts,
          lastPrincipal:
            discovery.identity.userName ||
            discovery.identity.displayName ||
            discovery.identity.id,
        },
        updatedAt: now,
      })
      .where(eq(integrations.id, integrationId));
    return {
      scanId: scan.id,
      status: "completed" as const,
      agentsDiscovered: discovery.agents.length,
      resourcesScanned: discovery.counts,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Databricks discovery failed";
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
