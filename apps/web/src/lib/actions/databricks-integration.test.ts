import { createAuditEvent } from "@/lib/server/audit";
import { auth } from "@clerk/nextjs/server";
import { encryptSecret } from "@/lib/server/crypto";
import {
  runDatabricksDiscoveryScan,
  testDatabricksConnection,
} from "@/lib/server/databricks/discovery-orchestrator";
import { revalidatePath } from "next/cache";
import {
  createDatabricksConnection,
  deleteDatabricksConnection,
  ensureDatabricksIntegrationCatalogEntry,
  testDatabricksIntegrationConnection,
  triggerDatabricksDiscovery,
} from "./databricks-integration";

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(async () => ({ userId: "user-1", orgId: "tenant-1" })),
}));

jest.mock("drizzle-orm", () => ({
  and: jest.fn((...conditions) => ({ and: conditions })),
  eq: jest.fn((left, right) => ({ left, right })),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/server/audit", () => ({
  createAuditEvent: jest.fn(async () => undefined),
}));

jest.mock("@/lib/server/crypto", () => ({
  encryptSecret: jest.fn(() => "encrypted-credentials"),
}));

jest.mock("@/lib/server/databricks/discovery-orchestrator", () => ({
  normalizeDatabricksHost: jest.fn(
    () => "https://dbc-1234.cloud.databricks.com",
  ),
  runDatabricksDiscoveryScan: jest.fn(async () => ({
    scanId: "scan-1",
    status: "completed",
    agentsDiscovered: 4,
    resourcesScanned: { databricks_app: 2 },
  })),
  testDatabricksConnection: jest.fn(async () => ({
    ok: true,
    appsVisible: 2,
  })),
}));

jest.mock("@db", () => {
  const state = {
    setPayloads: [] as Array<Record<string, unknown>>,
    tenantRows: [] as Array<Array<{ id: string; slug: string }>>,
    integrationRows: [] as Array<{
      id: string;
      tenantId: string;
      name: string;
      configuration: Record<string, unknown>;
      credentialsEncrypted: string;
    } | null>,
    integration: {
      id: "integration-1",
      tenantId: "tenant-1",
      name: "Databricks Unity Catalog",
      configuration: {},
      credentialsEncrypted: "encrypted-existing",
    },
  };
  const integrations = {
    id: "integrations.id",
    tenantId: "integrations.tenant_id",
    name: "integrations.name",
  };
  const tenants = {
    id: "tenants.id",
    slug: "tenants.slug",
  };
  const agents = {
    integrationId: "agents.integration_id",
    tenantId: "agents.tenant_id",
  };
  const db = {
    query: {
      integrations: {
        findFirst: jest.fn(async () =>
          state.integrationRows.length
            ? state.integrationRows.shift()
            : state.integration,
        ),
      },
    },
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () =>
            state.tenantRows.length
              ? state.tenantRows.shift()
              : [{ id: "tenant-1", slug: "tenant-slug" }],
          ),
        })),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn((payload) => {
        state.setPayloads.push(payload);
        return {
          where: jest.fn(() => ({
            returning: jest.fn(async () => [
              { ...state.integration, ...payload },
            ]),
          })),
        };
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(async () => [state.integration]),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn(async () => undefined),
    })),
  };
  return { agents, db, integrations, tenants, __state: state };
});

const databaseState = jest.requireMock("@db").__state as {
  setPayloads: Array<Record<string, unknown>>;
  tenantRows: Array<Array<{ id: string; slug: string }>>;
  integrationRows: Array<Record<string, unknown> | null>;
};

describe("Databricks integration actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    databaseState.setPayloads.length = 0;
    databaseState.tenantRows.length = 0;
    databaseState.integrationRows.length = 0;
  });

  it("encrypts credentials and saves every required discovery scope", async () => {
    await expect(
      createDatabricksConnection({
        tenantSlugOrId: "tenant-slug",
        workspaceUrl: "https://dbc-1234.cloud.databricks.com",
        accessToken: "  workspace-token  ",
      }),
    ).resolves.toEqual({
      id: "integration-1",
      hostUrl: "https://dbc-1234.cloud.databricks.com",
    });

    expect(encryptSecret).toHaveBeenCalledWith(
      JSON.stringify({
        hostUrl: "https://dbc-1234.cloud.databricks.com",
        accessToken: "workspace-token",
      }),
    );
    expect(databaseState.setPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isCredentialsAdded: true,
          isEnabled: true,
          credentialsEncrypted: "encrypted-credentials",
          configuration: expect.objectContaining({
            discoveryScopes: [
              "unity-catalog",
              "serving-endpoints",
              "apps",
              "jobs",
              "genie",
              "workspace",
              "current-user",
            ],
          }),
        }),
      ]),
    );
    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "databricks_connection.created",
        targetId: "integration-1",
      }),
    );
  });

  it("tests and manually scans the stored connection", async () => {
    await expect(
      testDatabricksIntegrationConnection("tenant-slug", "integration-1"),
    ).resolves.toEqual({ ok: true, appsVisible: 2 });
    expect(testDatabricksConnection).toHaveBeenCalled();

    await expect(
      triggerDatabricksDiscovery("tenant-slug", "integration-1"),
    ).resolves.toEqual(
      expect.objectContaining({ status: "completed", agentsDiscovered: 4 }),
    );
    expect(runDatabricksDiscoveryScan).toHaveBeenCalledWith(
      "tenant-1",
      "integration-1",
      expect.objectContaining({ id: "integration-1" }),
      "user-1",
    );
    expect(revalidatePath).toHaveBeenCalledTimes(5);
  });

  it("removes stored credentials and disables the integration", async () => {
    await deleteDatabricksConnection("tenant-slug", "integration-1");

    expect(databaseState.setPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          configuration: {},
          credentialsEncrypted: null,
          isCredentialsAdded: false,
          isEnabled: false,
        }),
      ]),
    );
    expect(createAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "databricks_connection.deleted",
      }),
    );
  });

  it("creates the catalog entry when neither current nor legacy entry exists", async () => {
    databaseState.integrationRows.push(null, null);

    await expect(
      ensureDatabricksIntegrationCatalogEntry("tenant-slug"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "integration-1",
        name: "Databricks Unity Catalog",
      }),
    );
  });

  it("supports tenant slug lookup and rejects unauthorised tenant access", async () => {
    databaseState.tenantRows.push(
      [],
      [{ id: "tenant-1", slug: "tenant-slug" }],
    );
    await expect(
      ensureDatabricksIntegrationCatalogEntry("tenant-slug"),
    ).resolves.toEqual(expect.objectContaining({ id: "integration-1" }));

    databaseState.tenantRows.push([{ id: "different-tenant", slug: "other" }]);
    await expect(
      ensureDatabricksIntegrationCatalogEntry("other"),
    ).rejects.toThrow("Tenant access denied");
  });

  it("rejects missing authentication, blank tokens, and non-Databricks connections", async () => {
    (auth as unknown as jest.Mock).mockResolvedValueOnce({
      userId: null,
      orgId: null,
    });
    await expect(
      ensureDatabricksIntegrationCatalogEntry("tenant-slug"),
    ).rejects.toThrow("Authentication required");

    await expect(
      createDatabricksConnection({
        tenantSlugOrId: "tenant-slug",
        workspaceUrl: "https://dbc-1234.cloud.databricks.com",
        accessToken: "   ",
      }),
    ).rejects.toThrow("Databricks access token is required");

    databaseState.integrationRows.push({
      id: "integration-1",
      tenantId: "tenant-1",
      name: "AWS",
      configuration: {},
      credentialsEncrypted: "encrypted-existing",
    });
    await expect(
      testDatabricksIntegrationConnection("tenant-slug", "integration-1"),
    ).rejects.toThrow("Databricks Unity Catalog connection not found");
  });
});
