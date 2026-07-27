// db.select().from(table).where() is called for agents, integrations and users;
// resolve each from a per-table fixture keyed by a marker on the mocked table.
const fixtures: Record<string, unknown[]> = { agents: [], integrations: [], users: [] };
const updatedIds: unknown[] = [];

jest.mock("@db", () => ({
  agents: { __t: "agents", tenantId: "tenantId", id: "id", ownerUserId: "ownerUserId", platform: "platform" },
  integrations: { __t: "integrations", tenantId: "tenantId", name: "name", createdBy: "createdBy", id: "id" },
  users: { __t: "users", id: "id" },
  db: {
    select: () => ({
      from: (table: { __t: string }) => ({
        where: () => Promise.resolve(fixtures[table.__t]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          updatedIds.push(w);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

jest.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
}));

import { assignFallbackOwnership } from "./ownership-fallback";

beforeEach(() => {
  fixtures.agents = [];
  fixtures.integrations = [];
  fixtures.users = [];
  updatedIds.length = 0;
});

describe("assignFallbackOwnership", () => {
  it("attributes an unowned agent to its provider integration's creator", async () => {
    fixtures.agents = [{ id: "agent-1", platform: "aws_ec2" }];
    fixtures.integrations = [{ name: "AWS", createdBy: "user-1" }];
    fixtures.users = [{ id: "user-1" }];
    const updated = await assignFallbackOwnership("tenant-1");
    expect(updated).toBe(1);
    expect(updatedIds).toHaveLength(1);
  });

  it("maps platforms to the right provider integration", async () => {
    fixtures.agents = [
      { id: "a", platform: "crewai" },
      { id: "b", platform: "databricks_apps" },
    ];
    fixtures.integrations = [
      { name: "CrewAI", createdBy: "user-1" },
      { name: "Databricks Unity Catalog", createdBy: "user-1" },
    ];
    fixtures.users = [{ id: "user-1" }];
    expect(await assignFallbackOwnership("tenant-1")).toBe(2);
  });

  it("returns 0 when there are no unowned agents", async () => {
    fixtures.agents = [];
    expect(await assignFallbackOwnership("tenant-1")).toBe(0);
  });

  it("skips agents whose integration creator is not a real user", async () => {
    fixtures.agents = [{ id: "agent-1", platform: "aws_ec2" }];
    fixtures.integrations = [{ name: "AWS", createdBy: "ghost-user" }];
    fixtures.users = []; // ghost-user has no local record
    expect(await assignFallbackOwnership("tenant-1")).toBe(0);
  });

  it("skips agents on an unmapped platform", async () => {
    fixtures.agents = [{ id: "agent-1", platform: "other" }];
    fixtures.integrations = [{ name: "AWS", createdBy: "user-1" }];
    fixtures.users = [{ id: "user-1" }];
    expect(await assignFallbackOwnership("tenant-1")).toBe(0);
  });
});
