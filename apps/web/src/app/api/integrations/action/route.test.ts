/** @jest-environment node */
import { POST } from "./route";
import { deleteAwsConnection, testAwsIntegrationConnection } from "@/lib/actions/aws-integration";
import { triggerManualScan } from "@/lib/actions/aws-discovery";
import { disconnectNango } from "@/lib/actions/nango-connect";

jest.mock("@db", () => ({
  db: {
    query: {
      integrations: {
        findFirst: jest.fn(async () => ({
          nangoConnectionId: "conn-1",
          nangoProviderConfigKey: "aws",
          configuration: { awsConnectionId: "aws-row-1" },
        })),
      },
    },
  },
  integrations: {},
  tenants: {},
}));
jest.mock("@/lib/server/tenant-access", () => ({
  requireTenantMember: jest.fn(async () => ({ tenantId: "tenant-1" })),
}));
jest.mock("@/lib/server/nango/client", () => ({}));
jest.mock("@/lib/actions/aws-discovery", () => ({ triggerManualScan: jest.fn() }));
jest.mock("@/lib/actions/aws-integration", () => ({
  syncAwsConnectionFromNango: jest.fn(async () => ({ awsConnectionId: "aws-row-1" })),
  testAwsIntegrationConnection: jest.fn(),
  deleteAwsConnection: jest.fn(),
}));
jest.mock("@/lib/actions/azure-integration", () => ({}));
jest.mock("@/lib/actions/gcp-integration", () => ({}));
jest.mock("@/lib/actions/databricks-integration", () => ({}));
jest.mock("@/lib/actions/crewai-integration", () => ({}));
jest.mock("@/lib/actions/github-integration", () => ({}));
jest.mock("@/lib/actions/langsmith-integration", () => ({}));
jest.mock("@/lib/actions/integrations", () => ({}));
jest.mock("@/lib/actions/nango-connect", () => ({ disconnectNango: jest.fn() }));
jest.mock("@/lib/server/agents/prune-orphans", () => ({ pruneOrphanAgents: jest.fn() }));
jest.mock("@/lib/server/github/model-scan", () => ({ purgeRepoModelsIfGithubGone: jest.fn() }));

const connectAws = () =>
  POST(
    new Request("http://x/api/integrations/action", {
      method: "POST",
      body: JSON.stringify({
        action: "nangoConnected",
        tenantSlugOrId: "acme",
        integrationId: "int-1",
        providerName: "AWS",
      }),
    }) as never,
  );

describe("nangoConnected is all or nothing", () => {
  beforeEach(() => jest.clearAllMocks());

  it("removes the connection when AWS rejects the credentials", async () => {
    (testAwsIntegrationConnection as jest.Mock).mockResolvedValue({ ok: false, error: "InvalidClientTokenId" });
    const res = await connectAws();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("InvalidClientTokenId");
    expect(deleteAwsConnection).toHaveBeenCalledWith("acme", "aws-row-1");
    expect(disconnectNango).toHaveBeenCalledWith({ tenantSlugOrId: "acme", integrationId: "int-1" });
  });

  it("removes the connection when the first discovery fails", async () => {
    (testAwsIntegrationConnection as jest.Mock).mockResolvedValue({ ok: true });
    (triggerManualScan as jest.Mock).mockResolvedValue({ status: "failed", errorMessage: "boom" });
    const res = await connectAws();
    expect(res.status).toBe(500);
    expect(disconnectNango).toHaveBeenCalled();
  });

  it("keeps a working connection", async () => {
    (testAwsIntegrationConnection as jest.Mock).mockResolvedValue({ ok: true });
    (triggerManualScan as jest.Mock).mockResolvedValue({ status: "completed", agentsDiscovered: 3 });
    const res = await connectAws();
    expect(res.status).toBe(200);
    expect(disconnectNango).not.toHaveBeenCalled();
  });
});
