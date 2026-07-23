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
  DatabricksApiError,
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
  task?: string;
  description?: string;
  endpoint_url?: string;
  permission_level?: string;
}

interface DatabricksAppDeployment {
  deployment_id?: string;
  source_code_path?: string;
  command?: string[];
  create_time?: string;
  update_time?: string;
  creator?: string;
  status?: { state?: string; message?: string };
  git_source?: Record<string, unknown>;
  env_vars?: Array<{ name?: string; value?: string }>;
}

interface DatabricksApp {
  id?: string;
  name: string;
  description?: string;
  url?: string;
  creator?: string;
  updater?: string;
  create_time?: string;
  update_time?: string;
  default_source_code_path?: string;
  app_status?: { state?: string; message?: string };
  compute_status?: { state?: string; message?: string };
  active_deployment?: DatabricksAppDeployment;
  pending_deployment?: DatabricksAppDeployment;
  resources?: Array<Record<string, unknown>>;
  effective_user_api_scopes?: string[];
  service_principal_name?: string;
}

interface DatabricksJobTask {
  task_key?: string;
  description?: string;
  notebook_task?: { notebook_path?: string };
  spark_python_task?: { python_file?: string };
  python_wheel_task?: { package_name?: string; entry_point?: string };
  run_job_task?: { job_id?: number };
  existing_cluster_id?: string;
  job_cluster_key?: string;
}

interface DatabricksJob {
  job_id: number;
  creator_user_name?: string;
  created_time?: number;
  run_as_user_name?: string;
  settings?: {
    name?: string;
    description?: string;
    tags?: Record<string, string>;
    tasks?: DatabricksJobTask[];
    schedule?: Record<string, unknown>;
    continuous?: Record<string, unknown>;
    trigger?: Record<string, unknown>;
    deployment?: Record<string, unknown>;
    git_source?: Record<string, unknown>;
    run_as?: Record<string, unknown>;
    max_concurrent_runs?: number;
    timeout_seconds?: number;
  };
  trigger_state?: Record<string, unknown>;
  latest_run?: {
    run_id?: number;
    start_time?: number;
    end_time?: number;
    run_duration?: number;
    state?: {
      life_cycle_state?: string;
      result_state?: string;
      state_message?: string;
    };
    run_page_url?: string;
  };
}

interface WorkspaceObject {
  object_id?: number;
  resource_id?: string;
  object_type?: string;
  path?: string;
  language?: string;
  created_at?: number;
  modified_at?: number;
}

interface GenieSpace {
  space_id: string;
  title?: string;
  description?: string;
  warehouse_id?: string;
  parent_path?: string;
  etag?: string;
  serialized_space?: string;
}

export interface DatabricksDiscovery {
  identity: DatabricksIdentity;
  catalogs: Catalog[];
  schemas: Schema[];
  tables: Table[];
  models: RegisteredModel[];
  endpoints: ServingEndpoint[];
  apps: DatabricksApp[];
  jobs: DatabricksJob[];
  notebooks: WorkspaceObject[];
  genieSpaces: GenieSpace[];
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

async function getJobDetails(
  credentials: DatabricksCredentials,
  jobId: number,
): Promise<DatabricksJob> {
  let pageToken: string | undefined;
  let combined: DatabricksJob | undefined;
  const seenTokens = new Set<string>();
  do {
    const query = new URLSearchParams({ job_id: String(jobId) });
    if (pageToken) query.set("page_token", pageToken);
    const page = await databricksApi<
      DatabricksJob & { next_page_token?: string }
    >(credentials, "/api/2.2/jobs/get", query);
    if (!combined) {
      combined = page;
    } else {
      combined.settings = {
        ...combined.settings,
        tasks: [
          ...(combined.settings?.tasks ?? []),
          ...(page.settings?.tasks ?? []),
        ],
      };
    }
    const next = page.next_page_token;
    if (next && seenTokens.has(next)) {
      throw new Error(
        `Databricks returned a repeated pagination token for job ${jobId}`,
      );
    }
    if (next) seenTokens.add(next);
    pageToken = next;
  } while (pageToken);
  if (!combined) throw new Error(`Databricks job ${jobId} was not returned`);
  return combined;
}

async function discoverWorkspaceNotebooks(
  credentials: DatabricksCredentials,
): Promise<WorkspaceObject[]> {
  const queue = ["/"];
  const visited = new Set<string>();
  const notebooks: WorkspaceObject[] = [];
  let objectsVisited = 0;
  const maximumObjects = 50_000;

  while (queue.length > 0) {
    const paths = queue.splice(0, 5);
    const pages = await Promise.all(
      paths.map((path) =>
        databricksApi<{ objects?: WorkspaceObject[] }>(
          credentials,
          "/api/2.0/workspace/list",
          new URLSearchParams({ path }),
        ),
      ),
    );
    for (const page of pages) {
      for (const item of page.objects ?? []) {
        objectsVisited += 1;
        if (objectsVisited > maximumObjects) {
          throw new Error(
            `Workspace inventory exceeds ${maximumObjects} objects; narrow the workspace or use a dedicated discovery principal`,
          );
        }
        if (item.object_type === "NOTEBOOK") notebooks.push(item);
        if (
          ["DIRECTORY", "REPO"].includes(item.object_type || "") &&
          item.path &&
          !visited.has(item.path)
        ) {
          visited.add(item.path);
          queue.push(item.path);
        }
      }
    }
  }
  return notebooks;
}

function tags(endpoint: ServingEndpoint): Record<string, string> {
  return Object.fromEntries(
    (endpoint.tags ?? []).flatMap((tag) =>
      tag.key ? [[tag.key, tag.value ?? ""]] : [],
    ),
  );
}

function sanitizeServedEntity(entity: ServedEntity) {
  return {
    entityName: entity.entity_name,
    entityVersion: entity.entity_version,
    name: entity.name,
    workloadType: entity.workload_type,
    workloadSize: entity.workload_size,
    scaleToZeroEnabled: entity.scale_to_zero_enabled,
    externalModel: entity.external_model
      ? {
          name: entity.external_model.name,
          provider: entity.external_model.provider,
          task: entity.external_model.task,
        }
      : undefined,
  };
}

function sanitizeEndpoint(endpoint: ServingEndpoint) {
  return {
    id: endpoint.id,
    name: endpoint.name,
    description: endpoint.description,
    task: endpoint.task,
    creator: endpoint.creator,
    creationTimestamp: endpoint.creation_timestamp,
    lastUpdatedTimestamp: endpoint.last_updated_timestamp,
    state: endpoint.state,
    tags: endpoint.tags,
    routeOptimized: endpoint.route_optimized,
    endpointUrl: endpoint.endpoint_url,
    permissionLevel: endpoint.permission_level,
    aiGatewayConfigured: Boolean(endpoint.ai_gateway),
    servedEntities: [
      ...(endpoint.config?.served_entities ?? []),
      ...(endpoint.config?.served_models ?? []),
    ].map(sanitizeServedEntity),
  };
}

function sanitizeApp(app: DatabricksApp) {
  const deployment = (value?: DatabricksAppDeployment) =>
    value
      ? {
          ...value,
          env_vars: (value.env_vars ?? []).map((item) => ({
            name: item.name,
          })),
        }
      : undefined;
  return {
    ...app,
    active_deployment: deployment(app.active_deployment),
    pending_deployment: deployment(app.pending_deployment),
  };
}

function sanitizeJob(job: DatabricksJob) {
  return {
    job_id: job.job_id,
    creator_user_name: job.creator_user_name,
    created_time: job.created_time,
    run_as_user_name: job.run_as_user_name,
    trigger_state: job.trigger_state,
    latest_run: job.latest_run,
    settings: {
      name: job.settings?.name,
      description: job.settings?.description,
      tags: job.settings?.tags,
      schedule: job.settings?.schedule,
      continuous: job.settings?.continuous,
      trigger: job.settings?.trigger,
      deployment: job.settings?.deployment,
      git_source: job.settings?.git_source,
      run_as: job.settings?.run_as,
      max_concurrent_runs: job.settings?.max_concurrent_runs,
      timeout_seconds: job.settings?.timeout_seconds,
      tasks: (job.settings?.tasks ?? []).map((task) => ({
        task_key: task.task_key,
        description: task.description,
        notebook_path: task.notebook_task?.notebook_path,
        python_file: task.spark_python_task?.python_file,
        python_package: task.python_wheel_task?.package_name,
        python_entry_point: task.python_wheel_task?.entry_point,
        child_job_id: task.run_job_task?.job_id,
        existing_cluster_id: task.existing_cluster_id,
        job_cluster_key: task.job_cluster_key,
      })),
    },
  };
}

function genieConfiguration(space: GenieSpace): Record<string, unknown> | null {
  if (!space.serialized_space) return null;
  try {
    return JSON.parse(space.serialized_space) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function genieDataSourceNames(space: GenieSpace): string[] {
  const configuration = genieConfiguration(space);
  const dataSources = configuration?.data_sources as
    | {
        tables?: Array<{ identifier?: string }>;
        metric_views?: Array<{ identifier?: string }>;
      }
    | undefined;
  return [
    ...(dataSources?.tables ?? []),
    ...(dataSources?.metric_views ?? []),
  ].flatMap((item) => (item.identifier ? [item.identifier] : []));
}

function appHasAgentSignal(app: DatabricksApp): boolean {
  if (
    hasAgentSignal({
      name: app.name,
      description: app.description,
      path:
        app.active_deployment?.source_code_path || app.default_source_code_path,
    })
  ) {
    return true;
  }
  const resources = JSON.stringify(app.resources ?? []).toLowerCase();
  if (
    resources.includes("serving_endpoint") ||
    resources.includes("genie_space")
  ) {
    return true;
  }
  return (app.active_deployment?.command ?? []).some((item) =>
    /responsesagent|chatagent|agent_framework|langgraph|langchain|crewai|autogen/i.test(
      item,
    ),
  );
}

function jobHasAgentSignal(job: DatabricksJob): boolean {
  const settings = job.settings;
  if (
    hasAgentSignal({
      name: settings?.name,
      description: settings?.description,
      tags: settings?.tags,
    })
  ) {
    return true;
  }
  return (settings?.tasks ?? []).some((task) =>
    [
      task.task_key,
      task.description,
      task.notebook_task?.notebook_path,
      task.spark_python_task?.python_file,
      task.python_wheel_task?.package_name,
      task.python_wheel_task?.entry_point,
    ].some((item) => AI_SIGNAL.test(item || "")),
  );
}

function endpointHasAgentSignal(
  endpoint: ServingEndpoint,
  models: Map<string, RegisteredModel>,
): boolean {
  if (
    hasAgentSignal({
      name: endpoint.name,
      description: endpoint.description,
      tags: tags(endpoint),
    }) ||
    /agent|responses/i.test(endpoint.task || "")
  ) {
    return true;
  }
  const entities = [
    ...(endpoint.config?.served_entities ?? []),
    ...(endpoint.config?.served_models ?? []),
  ];
  return entities.some((entity) => {
    const model = entity.entity_name ? models.get(entity.entity_name) : null;
    return model ? hasAgentSignal(model) : false;
  });
}

function hasAgentSignal(value: {
  name?: string;
  full_name?: string;
  comment?: string;
  description?: string;
  path?: string;
  properties?: Record<string, string>;
  tags?: Record<string, string>;
}): boolean {
  if (
    [
      value.full_name,
      value.name,
      value.comment,
      value.description,
      value.path,
    ].some((item) => AI_SIGNAL.test(item || ""))
  ) {
    return true;
  }
  return Object.entries({
    ...(value.properties ?? {}),
    ...(value.tags ?? {}),
  }).some(
    ([key, item]) =>
      AI_SIGNAL.test(key) ||
      (["norix.agent", "ai.agent", "agent"].includes(key.toLowerCase()) &&
        !["false", "disabled", "0"].includes(item.toLowerCase())),
  );
}

function isoValue(value?: number | string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resource(
  resourceType: DiscoveredResourceType,
  id: string,
  name: string,
  metadata: Record<string, unknown>,
  createdAt?: number | string,
  updatedAt?: number | string,
  resourceTags: Record<string, string> = {},
): RawDiscoveredResource {
  return {
    resourceType,
    resourceId: id,
    resourceArn: id,
    resourceName: name,
    region: "workspace",
    tags: resourceTags,
    createdAt: isoValue(createdAt),
    lastUpdatedAt: isoValue(updatedAt),
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
  const tableMap = new Map(
    discovery.tables.map((table) => [
      table.full_name ||
        `${table.catalog_name}.${table.schema_name}.${table.name}`,
      table,
    ]),
  );
  const agentsFound: CorrelatedAgent[] = [];
  const servedModelNames = new Set<string>();
  const notebookMap = new Map(
    discovery.notebooks.flatMap((notebook) =>
      notebook.path ? [[notebook.path, notebook]] : [],
    ),
  );

  for (const space of discovery.genieSpaces) {
    const genieResource = resource(
      "databricks_genie_space",
      `databricks:genie:${space.space_id}`,
      space.title || `Genie Agent ${space.space_id}`,
      {
        spaceId: space.space_id,
        title: space.title,
        description: space.description,
        warehouseId: space.warehouse_id,
        parentPath: space.parent_path,
        etag: space.etag,
        configuration: genieConfiguration(space),
        dataSources: genieDataSourceNames(space),
        hasWrite: true,
        discoveryQualification:
          "Native Genie Agent returned by the Databricks Genie management API.",
      },
    );
    const dataResources = genieDataSourceNames(space).flatMap((name) => {
      const table = tableMap.get(name);
      return table
        ? [
            resource(
              "databricks_table",
              `databricks:table:${name}`,
              name,
              {
                owner: table.owner,
                comment: table.comment,
                tableType: table.table_type,
                dataSourceFormat: table.data_source_format,
                discoveryQualification:
                  "Unity Catalog asset is configured as a Genie Agent data source.",
              },
              table.created_at,
              table.updated_at,
            ),
          ]
        : [];
    });
    agentsFound.push({
      externalAgentId: genieResource.resourceId,
      name: genieResource.resourceName,
      platform: "databricks_genie",
      region: "workspace",
      discoverySource: "databricks_genie_space",
      resources: [genieResource, ...dataResources],
    });
  }

  for (const app of discovery.apps.filter(appHasAgentSignal)) {
    const appId = app.id || app.name;
    const appResource = resource(
      "databricks_app",
      `databricks:app:${appId}`,
      app.name,
      {
        appId: app.id,
        description: app.description,
        url: app.url,
        creator: app.creator,
        updater: app.updater,
        appStatus: app.app_status,
        computeStatus: app.compute_status,
        providerStatus:
          app.app_status?.state ||
          app.compute_status?.state ||
          (app.active_deployment ? "DEPLOYED" : "NOT_DEPLOYED"),
        servicePrincipalName: app.service_principal_name,
        effectiveUserApiScopes: app.effective_user_api_scopes,
        activeDeployment: app.active_deployment
          ? {
              ...app.active_deployment,
              env_vars: (app.active_deployment.env_vars ?? []).map((item) => ({
                name: item.name,
              })),
            }
          : null,
        pendingDeployment: app.pending_deployment
          ? {
              ...app.pending_deployment,
              env_vars: (app.pending_deployment.env_vars ?? []).map((item) => ({
                name: item.name,
              })),
            }
          : null,
        resources: app.resources ?? [],
        hasWrite: true,
        publicNetworkAccess: app.url ? "Enabled" : "Disabled",
        discoveryQualification:
          "Databricks App metadata, command, or declared resources identify an AI-agent deployment.",
      },
      app.create_time,
      app.update_time,
    );
    const sourcePath =
      app.active_deployment?.source_code_path || app.default_source_code_path;
    const sourceNotebook = sourcePath
      ? notebookMap.get(sourcePath.replace(/^\/Workspace/, ""))
      : undefined;
    const resources = [appResource];
    if (sourceNotebook?.path) {
      resources.push(
        resource(
          "databricks_notebook",
          `databricks:notebook:${sourceNotebook.resource_id || sourceNotebook.object_id || sourceNotebook.path}`,
          sourceNotebook.path,
          {
            objectId: sourceNotebook.object_id,
            resourceId: sourceNotebook.resource_id,
            language: sourceNotebook.language,
            discoveryQualification:
              "Notebook is the deployed source of an agent-identified Databricks App.",
          },
          sourceNotebook.created_at,
          sourceNotebook.modified_at,
        ),
      );
    }
    agentsFound.push({
      externalAgentId: appResource.resourceId,
      name: app.name,
      platform: "databricks_apps",
      region: "workspace",
      discoverySource: "databricks_app",
      resources,
    });
  }

  for (const job of discovery.jobs.filter(jobHasAgentSignal)) {
    const settings = job.settings;
    const jobResource = resource(
      "databricks_job",
      `databricks:job:${job.job_id}`,
      settings?.name || `Job ${job.job_id}`,
      {
        jobId: job.job_id,
        description: settings?.description,
        creator: job.creator_user_name,
        runAs: job.run_as_user_name || settings?.run_as,
        tags: settings?.tags ?? {},
        schedule: settings?.schedule,
        continuous: settings?.continuous,
        trigger: settings?.trigger,
        triggerState: job.trigger_state,
        latestRun: job.latest_run,
        deployment: settings?.deployment,
        gitSource: settings?.git_source,
        maxConcurrentRuns: settings?.max_concurrent_runs,
        timeoutSeconds: settings?.timeout_seconds,
        tasks: (settings?.tasks ?? []).map((task) => ({
          taskKey: task.task_key,
          description: task.description,
          notebookPath: task.notebook_task?.notebook_path,
          pythonFile: task.spark_python_task?.python_file,
          pythonPackage: task.python_wheel_task?.package_name,
          pythonEntryPoint: task.python_wheel_task?.entry_point,
          childJobId: task.run_job_task?.job_id,
          existingClusterId: task.existing_cluster_id,
          jobClusterKey: task.job_cluster_key,
        })),
        hasWrite: true,
        discoveryQualification:
          "Databricks Job name, description, tags, or task definitions explicitly identify an agent workflow.",
      },
      job.created_time,
      job.latest_run?.end_time || job.latest_run?.start_time,
      settings?.tags ?? {},
    );
    const notebooks = (settings?.tasks ?? []).flatMap((task) => {
      const path = task.notebook_task?.notebook_path;
      const notebook = path ? notebookMap.get(path) : undefined;
      if (!path) return [];
      return [
        resource(
          "databricks_notebook",
          `databricks:notebook:${notebook?.resource_id || notebook?.object_id || path}`,
          path,
          {
            objectId: notebook?.object_id,
            resourceId: notebook?.resource_id,
            language: notebook?.language,
            discoveryQualification:
              "Notebook is referenced by an agent-identified Databricks Job task.",
          },
          notebook?.created_at,
          notebook?.modified_at,
        ),
      ];
    });
    agentsFound.push({
      externalAgentId: jobResource.resourceId,
      name: jobResource.resourceName,
      platform: "databricks_jobs",
      region: "workspace",
      discoverySource: "databricks_job",
      resources: [
        jobResource,
        ...new Map(notebooks.map((item) => [item.resourceId, item])).values(),
      ],
    });
  }

  for (const endpoint of discovery.endpoints) {
    if (!endpointHasAgentSignal(endpoint, modelMap)) continue;
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
        task: endpoint.task,
        description: endpoint.description,
        endpointUrl: endpoint.endpoint_url,
        permissionLevel: endpoint.permission_level,
        creator: endpoint.creator,
        state: endpoint.state,
        providerStatus: endpoint.state?.ready,
        trafficConfig: endpoint.config?.traffic_config,
        autoCaptureConfig: endpoint.config?.auto_capture_config,
        aiGateway: endpoint.ai_gateway,
        routeOptimized: endpoint.route_optimized,
        servedEntities: entities.map(sanitizeServedEntity),
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

async function listApps(credentials: DatabricksCredentials, detailed = true) {
  let summaries: DatabricksApp[];
  try {
    summaries = await fetchDatabricksPages<DatabricksApp>(
      credentials,
      "/api/2.0/apps",
      "apps",
      undefined,
      { pageSizeParam: "page_size", pageSizeValue: "100" },
    );
  } catch (error) {
    if (error instanceof DatabricksApiError && error.status === 404) return [];
    throw error;
  }
  return detailed
    ? mapWithConcurrency(summaries, 5, (app) =>
        databricksApi<DatabricksApp>(
          credentials,
          `/api/2.0/apps/${encodeURIComponent(app.name)}`,
        ),
      )
    : summaries;
}

async function listJobs(credentials: DatabricksCredentials, detailed = true) {
  const summaries = await fetchDatabricksPages<DatabricksJob>(
    credentials,
    "/api/2.2/jobs/list",
    "jobs",
    { expand_tasks: "true" },
    { pageSizeParam: "limit", pageSizeValue: "100" },
  );
  return detailed
    ? mapWithConcurrency(summaries, 5, async (job) => {
        const [details, runResult] = await Promise.all([
          getJobDetails(credentials, job.job_id),
          databricksApi<{
            runs?: DatabricksJob["latest_run"][];
          }>(
            credentials,
            "/api/2.2/jobs/runs/list",
            new URLSearchParams({
              job_id: String(job.job_id),
              limit: "1",
            }),
          ),
        ]);
        return { ...details, latest_run: runResult.runs?.[0] };
      })
    : summaries;
}

async function listServingEndpoints(
  credentials: DatabricksCredentials,
  detailed = true,
) {
  const payload = await databricksApi<{ endpoints?: ServingEndpoint[] }>(
    credentials,
    "/api/2.0/serving-endpoints",
  );
  const endpoints = payload.endpoints ?? [];
  return detailed
    ? mapWithConcurrency(endpoints, 5, (endpoint) =>
        databricksApi<ServingEndpoint>(
          credentials,
          `/api/2.0/serving-endpoints/${encodeURIComponent(endpoint.name)}`,
        ),
      )
    : endpoints;
}

async function listGenieSpaces(
  credentials: DatabricksCredentials,
  detailed = true,
) {
  let spaces: GenieSpace[];
  try {
    spaces = await fetchDatabricksPages<GenieSpace>(
      credentials,
      "/api/2.0/genie/spaces",
      "spaces",
      undefined,
      { pageSizeParam: "page_size", pageSizeValue: "100" },
    );
  } catch (error) {
    if (error instanceof DatabricksApiError && error.status === 404) return [];
    throw error;
  }
  if (!detailed) return spaces;
  return mapWithConcurrency(spaces, 5, async (space) => {
    try {
      return await databricksApi<GenieSpace>(
        credentials,
        `/api/2.0/genie/spaces/${encodeURIComponent(space.space_id)}`,
        new URLSearchParams({ include_serialized_space: "true" }),
      );
    } catch {
      // CAN USE can enumerate and invoke a Genie Agent while serialized
      // configuration requires CAN EDIT. Preserve the real list evidence.
      return space;
    }
  });
}

export async function testDatabricksConnection(
  connection: DatabricksConnection,
) {
  try {
    const credentials = parseCredentials(connection);
    const [
      identity,
      catalogResult,
      endpoints,
      apps,
      jobs,
      genieSpaces,
      workspaceRoot,
    ] = await Promise.all([
      databricksApi<DatabricksIdentity>(
        credentials,
        "/api/2.0/preview/scim/v2/Me",
      ),
      fetchDatabricksPages<Catalog>(
        credentials,
        "/api/2.1/unity-catalog/catalogs",
        "catalogs",
      ),
      listServingEndpoints(credentials, false),
      listApps(credentials, false),
      listJobs(credentials, false),
      listGenieSpaces(credentials, false),
      databricksApi<{ objects?: WorkspaceObject[] }>(
        credentials,
        "/api/2.0/workspace/list",
        new URLSearchParams({ path: "/" }),
      ),
    ]);
    return {
      ok: true as const,
      workspaceHost: new URL(credentials.hostUrl).hostname,
      principal: identity.userName || identity.displayName || identity.id,
      catalogsVisible: catalogResult.length,
      servingEndpointsVisible: endpoints.length,
      appsVisible: apps.length,
      jobsVisible: jobs.length,
      genieAgentsVisible: genieSpaces.length,
      workspaceObjectsVisible: workspaceRoot.objects?.length ?? 0,
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
  const [
    identity,
    catalogs,
    models,
    endpoints,
    apps,
    jobs,
    notebooks,
    genieSpaces,
  ] = await Promise.all([
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
    listServingEndpoints(credentials),
    listApps(credentials),
    listJobs(credentials),
    discoverWorkspaceNotebooks(credentials),
    listGenieSpaces(credentials),
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
  const discovered = {
    identity,
    catalogs,
    schemas,
    tables,
    models,
    endpoints,
    apps,
    jobs,
    notebooks,
    genieSpaces,
  };
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
      databricks_app: apps.length,
      databricks_job: jobs.length,
      databricks_notebook: notebooks.length,
      databricks_genie_space: genieSpaces.length,
    },
  };
}

async function persistDatabricksInventory(
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
      metadata: sanitizeEndpoint(item),
    })),
    ...discovery.apps.map((item) => ({
      externalResourceId: `databricks:app:${item.id || item.name}`,
      resourceType: "databricks_app",
      resourceName: item.name,
      parentResourceId: null,
      metadata: sanitizeApp(item),
    })),
    ...discovery.jobs.map((item) => ({
      externalResourceId: `databricks:job:${item.job_id}`,
      resourceType: "databricks_job",
      resourceName: item.settings?.name || `Job ${item.job_id}`,
      parentResourceId: null,
      metadata: sanitizeJob(item),
    })),
    ...discovery.notebooks.flatMap((item) =>
      item.path
        ? [
            {
              externalResourceId: `databricks:notebook:${item.resource_id || item.object_id || item.path}`,
              resourceType: "databricks_notebook",
              resourceName: item.path,
              parentResourceId: null,
              metadata: item,
            },
          ]
        : [],
    ),
    ...discovery.genieSpaces.map((item) => ({
      externalResourceId: `databricks:genie:${item.space_id}`,
      resourceType: "databricks_genie_space",
      resourceName: item.title || `Genie Agent ${item.space_id}`,
      parentResourceId: null,
      metadata: {
        ...item,
        serialized_space: undefined,
        configuration: genieConfiguration(item),
        dataSources: genieDataSourceNames(item),
      },
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
    await persistDatabricksInventory(tenantId, integrationId, discovery, now);

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
      const providerStatus = String(
        agent.resources[0]?.metadata.providerStatus ?? "",
      ).toUpperCase();
      const providerInactive = [
        "CRASHED",
        "UNAVAILABLE",
        "STOPPED",
        "ERROR",
        "NOT_READY",
        "NOT_DEPLOYED",
      ].includes(providerStatus);
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
