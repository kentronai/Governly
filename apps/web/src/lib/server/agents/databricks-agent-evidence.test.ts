import { buildCapabilityFacts } from "./capability-engine";
import { detectOwnership } from "./ownership-engine";
import type { CorrelatedAgent } from "../aws/correlation";

jest.mock("drizzle-orm", () => ({
  eq: jest.fn((left, right) => ({ left, right })),
}));

jest.mock("@db", () => ({
  users: { email: "users.email" },
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
      },
    },
  },
}));

const mockedDatabase = jest.requireMock("@db").db as {
  query: { users: { findFirst: jest.Mock } };
};

describe("Databricks agent capability and ownership evidence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    "databricks_serving_endpoint",
    "databricks_app",
    "databricks_job",
    "databricks_genie_space",
  ] as const)(
    "treats %s as executable and conversational provider evidence without inventing write access",
    (resourceType) => {
      const facts = buildCapabilityFacts(
        agent([
          resource(resourceType, {
            publicNetworkAccess: "Enabled",
          }),
        ]),
        "user-1",
      );

      expect(facts).toEqual(
        expect.objectContaining({
          hasOwner: true,
          hasWritePermissions: false,
          hasInvokePermissions: true,
          hasExecuteCapableResource: true,
          isConversationalAgent: true,
          hasPublicEndpoint: true,
          resourceCount: 1,
        }),
      );
    },
  );

  it("maps an authoritative Databricks creator email to a NORIX user", async () => {
    mockedDatabase.query.users.findFirst.mockResolvedValueOnce({
      id: "user-creator",
      email: "creator@example.com",
    });

    await expect(
      detectOwnership(
        agent([
          resource("databricks_app", {
            creator: "creator@example.com",
          }),
        ]),
      ),
    ).resolves.toEqual({
      ownerUserId: "user-creator",
      ownerSource: "provider_metadata:creator",
      ownerConfidence: 0.85,
      businessFunction: null,
    });
  });

  it("does not guess ownership from non-email metadata or unknown principals", async () => {
    mockedDatabase.query.users.findFirst.mockResolvedValue(null);

    await expect(
      detectOwnership(
        agent([
          resource("databricks_job", {
            owner: "data-platform-team",
            runAs: "unknown@example.com",
          }),
        ]),
      ),
    ).resolves.toEqual({
      ownerUserId: null,
      ownerSource: null,
      ownerConfidence: 0,
      businessFunction: null,
    });
    expect(mockedDatabase.query.users.findFirst).toHaveBeenCalledTimes(1);
  });
});

function agent(resources: CorrelatedAgent["resources"]): CorrelatedAgent {
  return {
    externalAgentId: "databricks:test",
    name: "Test Agent",
    platform: "databricks_apps",
    region: "workspace",
    discoverySource: resources[0].resourceType,
    resources,
  };
}

function resource(
  resourceType: CorrelatedAgent["resources"][number]["resourceType"],
  metadata: Record<string, unknown>,
): CorrelatedAgent["resources"][number] {
  return {
    resourceType,
    resourceId: `databricks:${resourceType}`,
    resourceArn: `databricks:${resourceType}`,
    resourceName: resourceType,
    region: "workspace",
    tags: {},
    createdAt: null,
    lastUpdatedAt: new Date().toISOString(),
    metadata,
  };
}
