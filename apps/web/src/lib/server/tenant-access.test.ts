/** @jest-environment node */

/**
 * requireTenantMember is the single check that stops one tenant from reading or
 * changing another tenant's data through server actions (which are public POST
 * endpoints). The tenant named by the browser must be the caller's own Clerk org.
 */

let mockRows: Array<{ id: string; slug: string }> = [];

jest.mock("@clerk/nextjs/server", () => ({ auth: jest.fn() }));
jest.mock("@db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => mockRows }) }),
    }),
  },
  tenants: { id: "id", slug: "slug" },
  applications: { id: "id", tenantId: "tenant_id" },
}));

import { auth } from "@clerk/nextjs/server";
import { requireTenantMember } from "./tenant-access";

const mockAuth = auth as unknown as jest.Mock;

describe("requireTenantMember", () => {
  beforeEach(() => {
    mockRows = [{ id: "org_victim", slug: "victim-co" }];
  });

  it("allows a member of the named tenant", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", orgId: "org_victim", orgRole: "org:member" });
    await expect(requireTenantMember("victim-co")).resolves.toMatchObject({
      tenantId: "org_victim",
      userId: "u1",
    });
  });

  it("rejects a signed-in user from another tenant", async () => {
    mockAuth.mockResolvedValue({ userId: "u2", orgId: "org_attacker", orgRole: "org:admin" });
    await expect(requireTenantMember("victim-co")).rejects.toThrow("Tenant access denied");
  });

  it("rejects a user with no active org", async () => {
    mockAuth.mockResolvedValue({ userId: "u3", orgId: null });
    await expect(requireTenantMember("victim-co")).rejects.toThrow("Authentication required");
  });

  it("rejects signed-out callers", async () => {
    mockAuth.mockResolvedValue({ userId: null, orgId: null });
    await expect(requireTenantMember("victim-co")).rejects.toThrow("Authentication required");
  });

  it("rejects an unknown tenant", async () => {
    mockRows = [];
    mockAuth.mockResolvedValue({ userId: "u1", orgId: "org_victim" });
    await expect(requireTenantMember("nope")).rejects.toThrow("Tenant access denied");
  });
});
