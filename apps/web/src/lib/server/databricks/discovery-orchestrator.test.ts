import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";
import {
  databricksDiscoveryTesting,
  discoverDatabricks,
  runDatabricksDiscoveryScan,
  testDatabricksConnection,
  type DatabricksConnection,
} from "./discovery-orchestrator";

const mockedDatabaseModule = jest.requireMock("@db") as {
  agents: unknown;
  db: {
    transaction: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
  };
  discoveryScans: unknown;
  integrationDiscoveredResources: unknown;
};

jest.mock("drizzle-orm", () => ({
  and: jest.fn((...conditions) => ({ and: conditions })),
  eq: jest.fn((left, right) => ({ left, right })),
  notInArray: jest.fn((left, right) => ({ left, right })),
}));

jest.mock("@db", () => {
  const tables = {
    agents: {
      id: "agents.id",
      integrationId: "agents.integration_id",
      externalAgentId: "agents.external_agent_id",
    },
    agentRecommendations: {
      agentId: "agent_recommendations.agent_id",
      status: "agent_recommendations.status",
    },
    agentResources: { agentId: "agent_resources.agent_id" },
    discoveryScans: { id: "discovery_scans.id" },
    integrationDiscoveredResources: {
      integrationId: "integration_discovered_resources.integration_id",
      externalResourceId:
        "integration_discovered_resources.external_resource_id",
      firstSeenAt: "integration_discovered_resources.first_seen_at",
    },
    integrations: { id: "integrations.id" },
  };
  let createdAgent = 0;
  const returning = (table: unknown) =>
    jest.fn(async () => {
      if (table === tables.discoveryScans) return [{ id: "scan-1" }];
      if (table === tables.agents) {
        createdAgent += 1;
        return [{ id: `agent-${createdAgent}` }];
      }
      return [{}];
    });
  const tx = {
    delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    insert: jest.fn((table) => ({
      values: jest.fn(() => ({ returning: returning(table) })),
    })),
  };
  const db = {
    query: {
      agents: { findFirst: jest.fn(async () => null) },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => []),
      })),
    })),
    insert: jest.fn((table) => ({
      values: jest.fn(() => ({ returning: returning(table) })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    })),
    delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    transaction: jest.fn(async (callback) => callback(tx)),
  };
  return { ...tables, db };
});

jest.mock("@/lib/server/crypto", () => ({
  decryptSecret: jest.fn((value: string) => value),
}));

jest.mock("@/lib/server/agents/ownership-engine", () => ({
  detectOwnership: jest.fn(async () => ({
    ownerUserId: null,
    ownerSource: "unowned",
    ownerConfidence: 0,
    businessFunction: null,
  })),
}));

jest.mock("@/lib/server/agents/capability-engine", () => ({
  buildCapabilityFacts: jest.fn(() => ({
    isDormant: false,
    resourceCount: 1,
  })),
}));

jest.mock("@/lib/server/agents/autonomy-engine", () => ({
  classifyAutonomy: jest.fn(async () => ({
    level: "L2",
    reason: "test evidence",
    evidence: ["provider metadata"],
    confidence: 0.9,
  })),
}));

jest.mock("@/lib/server/agents/risk-engine", () => ({
  assessRisk: jest.fn(async () => ({
    score: 35,
    level: "Medium",
    factors: [{ description: "test", points: 5 }],
  })),
}));

jest.mock("@/lib/server/agents/recommendations-engine", () => ({
  generateRecommendations: jest.fn(() => [
    {
      recommendationType: "assign_owner",
      reason: "Owner missing",
      severity: "Medium",
      suggestedFix: "Assign an owner",
    },
  ]),
}));

jest.mock("@/lib/server/policy-enforcement/agent-policy-sync", () => ({
  syncAgentPolicyEvaluations: jest.fn(async () => undefined),
}));

const connection: DatabricksConnection = {
  id: "integration-1",
  credentialsEncrypted: JSON.stringify({
    hostUrl: "https://dbc-1234.cloud.databricks.com",
    accessToken: "token-value",
  }),
  configuration: { existing: true },
};

describe("Databricks discovery orchestrator", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(workspaceApi) as jest.Mock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("discovers and correlates every supported Databricks agent surface", async () => {
    const result = await discoverDatabricks(connection);

    expect(result.counts).toEqual({
      databricks_catalog: 1,
      databricks_schema: 1,
      databricks_table: 1,
      databricks_registered_model: 3,
      databricks_serving_endpoint: 2,
      databricks_app: 3,
      databricks_job: 2,
      databricks_notebook: 2,
      databricks_genie_space: 1,
    });
    expect(result.agents.map((agent) => agent.platform).sort()).toEqual(
      [
        "databricks_apps",
        "databricks_apps",
        "databricks_apps",
        "databricks_genie",
        "databricks_jobs",
        "databricks_model_serving",
        "databricks_model_serving",
        "databricks_unity_catalog",
      ].sort(),
    );
    expect(
      result.agents.find((agent) => agent.platform === "databricks_apps")
        ?.resources,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: "databricks_app" }),
        expect.objectContaining({ resourceType: "databricks_notebook" }),
      ]),
    );
    expect(
      result.agents.find((agent) => agent.platform === "databricks_genie")
        ?.resources,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: "databricks_table" }),
      ]),
    );
    expect(
      JSON.stringify(
        result.agents.find((agent) => agent.platform === "databricks_apps"),
      ),
    ).not.toContain("do-not-store");
  });

  it("validates all discovery APIs and returns real visible counts", async () => {
    await expect(testDatabricksConnection(connection)).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        principal: "scanner@example.com",
        catalogsVisible: 1,
        servingEndpointsVisible: 2,
        appsVisible: 3,
        jobsVisible: 2,
        genieAgentsVisible: 1,
      }),
    );
  });

  it("persists agents, resources, recommendations, scan status, and policy evaluations", async () => {
    const result = await runDatabricksDiscoveryScan(
      "tenant-1",
      "integration-1",
      connection,
      "user-1",
    );

    expect(result).toEqual(
      expect.objectContaining({
        scanId: "scan-1",
        status: "completed",
        agentsDiscovered: 8,
      }),
    );
    expect(mockedDatabaseModule.db.transaction).toHaveBeenCalled();
    expect(mockedDatabaseModule.db.insert).toHaveBeenCalledWith(
      mockedDatabaseModule.discoveryScans,
    );
    expect(mockedDatabaseModule.db.insert).toHaveBeenCalledWith(
      mockedDatabaseModule.agents,
    );
    expect(syncAgentPolicyEvaluations).toHaveBeenCalledTimes(8);
  });

  it("records a failed scan without leaking invalid credential content", async () => {
    const result = await runDatabricksDiscoveryScan(
      "tenant-1",
      "integration-1",
      { ...connection, credentialsEncrypted: "not-json" },
      null,
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "failed",
        agentsDiscovered: 0,
        errorMessage: "Stored Databricks credentials are invalid",
      }),
    );
    expect(mockedDatabaseModule.db.update).toHaveBeenCalled();
  });

  it("handles missing credentials and unavailable optional workspace features", async () => {
    await expect(
      testDatabricksConnection({
        ...connection,
        credentialsEncrypted: null,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Databricks credentials are missing",
    });

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/2.0/apps" || path === "/api/2.0/genie/spaces") {
        return apiResponse(
          { error_code: "FEATURE_DISABLED", message: "Feature disabled" },
          404,
        );
      }
      return workspaceApi(input);
    }) as jest.Mock;

    await expect(
      databricksDiscoveryTesting.listApps(credentials()),
    ).resolves.toEqual([]);
    await expect(
      databricksDiscoveryTesting.listGenieSpaces(credentials()),
    ).resolves.toEqual([]);
  });

  it("keeps Genie list evidence when detailed configuration is forbidden", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/2.0/genie/spaces/genie-1") {
        return apiResponse({ message: "CAN EDIT required" }, 403);
      }
      return workspaceApi(input);
    }) as jest.Mock;

    const spaces =
      await databricksDiscoveryTesting.listGenieSpaces(credentials());
    expect(spaces).toEqual([
      expect.objectContaining({ space_id: "genie-1", title: "Sales Genie" }),
    ]);
  });

  it("uses source evidence without failing when source export is unavailable", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/2.0/workspace/export") {
        if (url.searchParams.get("path") === "/Workspace/denied") {
          return apiResponse({ message: "Forbidden" }, 403);
        }
        return apiResponse({
          content: Buffer.from(
            "from agents import Agent\nsupport = Agent(name='support')",
          ).toString("base64"),
          file_type: "py",
        });
      }
      return workspaceApi(input);
    }) as jest.Mock;

    await expect(
      databricksDiscoveryTesting.inspectWorkspaceSource(
        credentials(),
        "/Workspace/denied",
      ),
    ).resolves.toEqual([]);
    await expect(
      databricksDiscoveryTesting.inspectWorkspaceSource(
        credentials(),
        "/Workspace/support",
      ),
    ).resolves.toEqual([
      {
        path: "/Workspace/support",
        signals: ["OpenAI Agents SDK"],
      },
    ]);
  });

  it("classifies strict agent evidence and sanitizes provider secrets", async () => {
    const testing = databricksDiscoveryTesting;
    expect(testing.hasAgentSignal({ name: "billing-service" })).toBe(false);
    expect(testing.hasAgentSignal({ name: "billing-agent" })).toBe(true);
    expect(
      testing.hasAgentSignal({
        tags: { "norix.agent": "false", environment: "production" },
      }),
    ).toBe(false);
    expect(testing.hasAgentSignal({ tags: { "norix.agent": "true" } })).toBe(
      true,
    );
    expect(
      testing.appHasAgentSignal({
        name: "plain-app",
        active_deployment: { command: ["npm", "start"] },
      }),
    ).toBe(true);
    expect(
      testing.appHasAgentSignal({
        name: "plain-app",
        resources: [{ serving_endpoint: { name: "assistant" } }],
      }),
    ).toBe(true);
    expect(
      testing.appHasAgentSignal({
        name: "plain-app",
        active_deployment: { command: ["python", "ResponsesAgent.py"] },
      }),
    ).toBe(true);
    expect(
      testing.jobHasAgentSignal({
        job_id: 9,
        settings: {
          name: "etl",
          tasks: [{ notebook_task: { notebook_path: "/agents/run" } }],
        },
      }),
    ).toBe(true);
    expect(
      testing.endpointHasAgentSignal(
        {
          name: "plain-endpoint",
          task: "llm/v1/responses",
        },
        new Map(),
      ),
    ).toBe(true);

    const app = testing.sanitizeApp({
      name: "assistant-app",
      active_deployment: {
        env_vars: [{ name: "OPENAI_API_KEY", value: "do-not-store" }],
      },
    });
    expect(app.active_deployment?.env_vars).toEqual([
      { name: "OPENAI_API_KEY" },
    ]);
    expect(JSON.stringify(app)).not.toContain("do-not-store");
    expect(testing.genieConfiguration({ space_id: "1" })).toBeNull();
    expect(
      testing.genieConfiguration({
        space_id: "1",
        serialized_space: "{invalid",
      }),
    ).toBeNull();
    expect(testing.isoValue("not-a-date")).toBeNull();
    expect(testing.isoValue()).toBeNull();
    expect(
      await testing.mapWithConcurrency([], 5, async (item) => item),
    ).toEqual([]);
  });

  it("covers provider fallback shapes without inventing agent evidence", async () => {
    const testing = databricksDiscoveryTesting;

    expect(() =>
      testing.parseCredentials({
        id: "missing-token",
        credentialsEncrypted: JSON.stringify({
          hostUrl: "https://dbc-1234.cloud.databricks.com",
        }),
        configuration: {},
      }),
    ).toThrow("workspace URL or access token is missing");
    expect(testing.isoValue(1_700_000_000_000)).toBe(
      "2023-11-14T22:13:20.000Z",
    );
    expect(
      testing.sanitizeServedEntity({
        external_model: {
          name: "claude",
          provider: "anthropic",
          task: "llm/v1/chat",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        externalModel: {
          name: "claude",
          provider: "anthropic",
          task: "llm/v1/chat",
        },
      }),
    );
    expect(testing.sanitizeEndpoint({ name: "empty" }).servedEntities).toEqual(
      [],
    );
    expect(
      testing.sanitizeEndpoint({
        name: "legacy",
        config: { served_models: [{ name: "legacy-model" }] },
      }).servedEntities,
    ).toEqual([expect.objectContaining({ name: "legacy-model" })]);
    expect(testing.sanitizeApp({ name: "plain" })).toEqual(
      expect.objectContaining({
        active_deployment: undefined,
        pending_deployment: undefined,
      }),
    );
    expect(testing.sanitizeJob({ job_id: 1 }).settings.tasks).toEqual([]);
    expect(
      testing.genieDataSourceNames({
        space_id: "genie",
        serialized_space: JSON.stringify({
          data_sources: {
            tables: [{}, { identifier: "main.sales.orders" }],
            metric_views: [{ identifier: "main.sales.revenue" }],
          },
        }),
      }),
    ).toEqual(["main.sales.orders", "main.sales.revenue"]);
    expect(
      testing.appHasAgentSignal({
        name: "plain",
        default_source_code_path: "/Workspace/agents/main.py",
      }),
    ).toBe(true);
    expect(
      testing.appHasAgentSignal({
        name: "plain",
        compute_status: { state: "STOPPED" },
        active_deployment: { command: ["python", "main.py"] },
      }),
    ).toBe(false);
    expect(testing.appHasAgentSignal({ name: "plain" })).toBe(false);
    expect(testing.jobHasAgentSignal({ job_id: 1 })).toBe(false);
    expect(
      testing.endpointHasAgentSignal(
        {
          name: "plain",
          config: {
            served_entities: [
              {},
              { entity_name: "missing.model" },
              { entity_name: "main.sales.assistant" },
            ],
          },
        },
        new Map([
          [
            "main.sales.assistant",
            {
              name: "assistant",
              catalog_name: "main",
              schema_name: "sales",
            },
          ],
        ]),
      ),
    ).toBe(true);
    expect(
      testing.hasAgentSignal({
        full_name: "main.sales.copilot",
        properties: { purpose: "governance" },
      }),
    ).toBe(true);
    expect(
      testing.hasAgentSignal({
        name: "billing",
        properties: { "ai-workload": "enabled" },
      }),
    ).toBe(true);

    const fallback = testing.correlate({
      identity: {},
      catalogs: [{ name: "main" }],
      schemas: [{ name: "sales", catalog_name: "main" }],
      tables: [
        {
          name: "agent_data",
          catalog_name: "main",
          schema_name: "sales",
        },
      ],
      models: [
        {
          name: "assistant",
          catalog_name: "main",
          schema_name: "sales",
        },
      ],
      endpoints: [
        {
          name: "agent-endpoint",
          config: { served_entities: [{}] },
          tags: [{}, { key: "environment" }],
        },
      ],
      apps: [
        {
          name: "agent-app",
          compute_status: { state: "ACTIVE" },
          pending_deployment: {
            env_vars: [{ name: "SECRET", value: "never-store" }],
          },
          url: "https://agent-app.example",
        },
      ],
      jobs: [
        {
          job_id: 77,
          settings: {
            tags: { agent: "true" },
            tasks: [{ notebook_task: { notebook_path: "/missing-notebook" } }],
          },
          latest_run: { start_time: 1_700_000_000_000 },
        },
      ],
      notebooks: [{ object_type: "NOTEBOOK" }],
      genieSpaces: [{ space_id: "untitled" }],
    });

    expect(fallback).toHaveLength(5);
    expect(JSON.stringify(fallback)).not.toContain("never-store");
    expect(fallback.map((agent) => agent.name)).toEqual(
      expect.arrayContaining([
        "Genie Agent untitled",
        "agent-app",
        "Job 77",
        "agent-endpoint",
        "main.sales.assistant",
      ]),
    );
  });

  it("propagates non-optional API errors and handles empty provider lists", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/2.0/apps") {
        return apiResponse({ message: "Databricks unavailable" }, 503);
      }
      return apiResponse({});
    }) as jest.Mock;

    await expect(
      databricksDiscoveryTesting.listApps(credentials()),
    ).rejects.toThrow("Databricks unavailable");
    await expect(
      databricksDiscoveryTesting.listServingEndpoints(credentials()),
    ).resolves.toEqual([]);
    await expect(
      databricksDiscoveryTesting.discoverWorkspaceNotebooks(credentials()),
    ).resolves.toEqual([]);
  });

  it("keeps Databricks Apps agents when optional Unity Catalog surfaces fail", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (
        path.startsWith("/api/2.1/unity-catalog") ||
        path === "/api/2.2/jobs/list" ||
        path === "/api/2.0/workspace/list" ||
        path === "/api/2.0/genie/spaces"
      ) {
        return apiResponse({ message: "Permission denied" }, 403);
      }
      return workspaceApi(input);
    }) as jest.Mock;

    const result = await discoverDatabricks(connection);

    expect(result.counts.databricks_partial_warnings).toBeGreaterThan(0);
    expect(result.counts.databricks_app).toBe(3);
    expect(
      result.agents.filter((agent) => agent.platform === "databricks_apps"),
    ).toHaveLength(3);
  });
});

function credentials() {
  return {
    hostUrl: "https://dbc-1234.cloud.databricks.com",
    accessToken: "token-value",
  };
}

async function workspaceApi(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input));
  const path = url.pathname;
  const pageToken = url.searchParams.get("page_token");

  if (path === "/api/2.0/preview/scim/v2/Me") {
    return apiResponse({ id: "user-1", userName: "scanner@example.com" });
  }
  if (path === "/api/2.1/unity-catalog/catalogs") {
    return apiResponse({
      catalogs: [
        {
          name: "main",
          owner: "data@example.com",
          catalog_type: "MANAGED_CATALOG",
          created_at: 1_700_000_000_000,
          updated_at: 1_700_000_100_000,
        },
      ],
    });
  }
  if (path === "/api/2.1/unity-catalog/schemas") {
    return apiResponse({
      schemas: [
        {
          name: "agent_schema",
          full_name: "main.agent_schema",
          catalog_name: "main",
          owner: "data@example.com",
        },
      ],
    });
  }
  if (path === "/api/2.1/unity-catalog/tables") {
    return apiResponse({
      tables: [
        {
          name: "agent_data",
          full_name: "main.agent_schema.agent_data",
          catalog_name: "main",
          schema_name: "agent_schema",
          owner: "data@example.com",
          table_type: "MANAGED",
          data_source_format: "DELTA",
        },
      ],
    });
  }
  if (path === "/api/2.1/unity-catalog/models") {
    return apiResponse({
      registered_models: [
        {
          name: "sales_agent",
          full_name: "main.agent_schema.sales_agent",
          catalog_name: "main",
          schema_name: "agent_schema",
          owner: "ml@example.com",
        },
        {
          name: "orphan-assistant",
          full_name: "main.agent_schema.orphan-assistant",
          catalog_name: "main",
          schema_name: "agent_schema",
          owner: "ml@example.com",
        },
        {
          name: "forecast",
          full_name: "main.agent_schema.forecast",
          catalog_name: "main",
          schema_name: "agent_schema",
        },
      ],
    });
  }
  if (path === "/api/2.0/serving-endpoints") {
    return apiResponse({
      endpoints: [
        { id: "endpoint-1", name: "sales-agent-endpoint" },
        { id: "endpoint-2", name: "forecast-endpoint" },
      ],
    });
  }
  if (path === "/api/2.0/serving-endpoints/sales-agent-endpoint") {
    return apiResponse({
      id: "endpoint-1",
      name: "sales-agent-endpoint",
      task: "agent/v1/responses",
      creator: "ml@example.com",
      state: { ready: "READY" },
      config: {
        served_entities: [
          {
            entity_name: "main.agent_schema.sales_agent",
            entity_version: "3",
            workload_size: "Small",
          },
        ],
      },
      tags: [{ key: "norix.agent", value: "true" }],
      ai_gateway: { usage_tracking_config: { enabled: true } },
    });
  }
  if (path === "/api/2.0/serving-endpoints/forecast-endpoint") {
    return apiResponse({
      id: "endpoint-2",
      name: "forecast-endpoint",
      task: "llm/v1/completions",
      state: { ready: "READY" },
      config: {
        served_entities: [
          { entity_name: "main.agent_schema.forecast", entity_version: "1" },
        ],
      },
    });
  }
  if (path === "/api/2.0/serving-endpoints/forecast-endpoint/openapi") {
    return apiResponse({
      openapi: "3.1.0",
      paths: {
        "/invocations": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    properties: {
                      input: { type: "array" },
                      databricks_options: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
  if (path.endsWith("/openapi")) {
    return apiResponse({ openapi: "3.1.0", paths: {} });
  }
  if (path === "/api/2.0/apps") {
    return apiResponse({
      apps: [
        { id: "app-1", name: "assistant-app" },
        { id: "app-2", name: "reporting-ui" },
        { id: "app-3", name: "customer-support" },
      ],
    });
  }
  if (path === "/api/2.0/apps/assistant-app") {
    return apiResponse({
      id: "app-1",
      name: "assistant-app",
      creator: "app@example.com",
      app_status: { state: "RUNNING" },
      active_deployment: {
        source_code_path: "/Workspace/Repos/agent.py",
        command: ["python", "ResponsesAgent.py"],
        env_vars: [
          { name: "OPENAI_API_KEY", value: "do-not-store" },
          { name: "MODE", value: "production" },
        ],
      },
      resources: [{ serving_endpoint: { name: "sales-agent-endpoint" } }],
    });
  }
  if (path === "/api/2.0/apps/reporting-ui") {
    return apiResponse({
      id: "app-2",
      name: "reporting-ui",
      active_deployment: { command: ["npm", "start"] },
    });
  }
  if (path === "/api/2.0/apps/customer-support") {
    return apiResponse({
      id: "app-3",
      name: "customer-support",
      active_deployment: {
        source_code_path: "/Workspace/Apps/customer-support",
        command: ["python", "main.py"],
      },
    });
  }
  if (path === "/api/2.0/workspace/export") {
    const sourcePath = url.searchParams.get("path");
    const source =
      sourcePath === "/Workspace/Apps/customer-support"
        ? "from mlflow.pyfunc import ResponsesAgent\nclass Support(ResponsesAgent): pass"
        : "print('ordinary workload')";
    return apiResponse({
      content: Buffer.from(source).toString("base64"),
      file_type: "py",
    });
  }
  if (path === "/api/2.2/jobs/list") {
    return apiResponse({ jobs: [{ job_id: 10 }, { job_id: 20 }] });
  }
  if (path === "/api/2.2/jobs/get") {
    const jobId = url.searchParams.get("job_id");
    if (jobId === "10" && !pageToken) {
      return apiResponse({
        job_id: 10,
        creator_user_name: "jobs@example.com",
        created_time: 1_700_000_000_000,
        settings: {
          name: "daily-agent-job",
          tags: { "norix.agent": "true" },
          tasks: [
            {
              task_key: "prepare",
              notebook_task: { notebook_path: "/Repos/agent.py" },
            },
          ],
        },
        next_page_token: "job-page-2",
      });
    }
    if (jobId === "10") {
      return apiResponse({
        job_id: 10,
        settings: {
          tasks: [
            {
              task_key: "invoke-agent",
              python_wheel_task: {
                package_name: "sales_agent",
                entry_point: "run",
              },
            },
          ],
        },
      });
    }
    return apiResponse({
      job_id: 20,
      settings: {
        name: "warehouse-maintenance",
        tasks: [
          {
            task_key: "vacuum",
            notebook_task: { notebook_path: "/Repos/maintenance" },
          },
        ],
      },
    });
  }
  if (path === "/api/2.2/jobs/runs/list") {
    return apiResponse({
      runs: [
        {
          run_id: 100,
          start_time: 1_700_000_200_000,
          end_time: 1_700_000_210_000,
          state: { life_cycle_state: "TERMINATED", result_state: "SUCCESS" },
        },
      ],
    });
  }
  if (path === "/api/2.0/workspace/list") {
    const workspacePath = url.searchParams.get("path");
    if (workspacePath === "/") {
      return apiResponse({
        objects: [
          { object_type: "DIRECTORY", path: "/Repos" },
          { object_type: "NOTEBOOK", path: "/root-agent", language: "PYTHON" },
        ],
      });
    }
    return apiResponse({
      objects: [
        {
          object_id: 1,
          resource_id: "notebook-1",
          object_type: "NOTEBOOK",
          path: "/Repos/agent.py",
          language: "PYTHON",
          modified_at: 1_700_000_300_000,
        },
      ],
    });
  }
  if (path === "/api/2.0/genie/spaces") {
    return apiResponse({
      spaces: [
        {
          space_id: "genie-1",
          title: "Sales Genie",
          description: "Answers sales questions",
        },
      ],
    });
  }
  if (path === "/api/2.0/genie/spaces/genie-1") {
    return apiResponse({
      space_id: "genie-1",
      title: "Sales Genie",
      warehouse_id: "warehouse-1",
      serialized_space: JSON.stringify({
        data_sources: {
          tables: [{ identifier: "main.agent_schema.agent_data" }],
        },
      }),
    });
  }
  return apiResponse({ message: `Unhandled test API path ${path}` }, 500);
}

function apiResponse(payload: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => payload,
  } as Response;
}
