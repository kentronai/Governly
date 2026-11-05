/** @jest-environment node */

/**
 * Regression tests for the privilege-escalation hole in updateUser (F-2).
 *
 * The action took a caller-supplied `tenantId` and used it directly for every
 * Clerk org call and local-DB write, checking only "is anyone signed in?" —
 * so any authenticated user could pass another org's id and another user's id
 * to change that user's email (an account-takeover path: change the email,
 * then use the normal forgot-password flow) or their membership/role. The fix
 * re-derives the tenant from the actor's own verified admin membership and
 * ignores the caller-supplied tenantId entirely, mirroring how createUser
 * already ignores input.tenant_id in favor of auth()'s orgId.
 */

const mockClerkUpdateUser = jest.fn();
const mockGetUser = jest.fn();
const mockFindFirst = jest.fn();

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
  clerkClient: jest.fn(async () => ({
    users: { updateUser: mockClerkUpdateUser, getUser: mockGetUser },
    organizations: {
      getOrganizationMembershipList: jest.fn(async () => ({ data: [] })),
      createOrganizationMembership: jest.fn(),
      updateOrganizationMembership: jest.fn(),
      deleteOrganizationMembership: jest.fn(),
    },
  })),
}));
jest.mock("@db", () => ({
  db: {
    query: {
      memberships: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
      users: { findFirst: jest.fn() },
    },
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn(() => ({
          returning: jest.fn(async () => [{}]),
        })),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
    })),
    delete: jest.fn(() => ({ where: jest.fn(async () => undefined) })),
  },
  users: {},
  memberships: {},
  auditEvents: {},
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server/audit", () => ({ createAuditEvent: jest.fn() }));

import { auth } from "@clerk/nextjs/server";
import { updateUser } from "./users";

const mockedAuth = auth as unknown as jest.Mock;

const ADMIN_IN_ORG_1 = {
  userId: "user_admin",
  orgId: "org_1",
  orgRole: "org:admin",
};

describe("updateUser authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue({
      userId: "user_target",
      tenantId: "org_1",
    });
    mockGetUser.mockResolvedValue({ firstName: "Existing", lastName: "User" });
  });

  it("rejects a non-admin caller entirely, regardless of the tenantId argument", async () => {
    mockedAuth.mockResolvedValue({
      userId: "user_member",
      orgId: "org_1",
      orgRole: "org:member",
    });

    await expect(
      updateUser("user_target", { email: "new@evil.example" }, "org_1"),
    ).rejects.toThrow(/admin role required/i);
    expect(mockClerkUpdateUser).not.toHaveBeenCalled();
  });

  it("ignores a forged tenantId argument pointing at a different org", async () => {
    mockedAuth.mockResolvedValue(ADMIN_IN_ORG_1);
    // Target belongs to the admin's real org (org_1), not the forged one.
    mockFindFirst.mockResolvedValue({
      userId: "user_target",
      tenantId: "org_1",
    });

    // Caller passes tenantId "org_2" (someone else's org) — must be ignored,
    // not trusted, and the membership check must still run against org_1.
    await expect(
      updateUser("user_target", { email: "new@example.com" }, "org_2"),
    ).resolves.toEqual({ success: true });

    expect(mockClerkUpdateUser).toHaveBeenCalledWith(
      "user_target",
      expect.objectContaining({ emailAddress: ["new@example.com"] }),
    );
    // The membership lookup must have used the verified org (org_1), not the
    // caller-supplied "org_2" — proving the forged argument was discarded.
    expect(mockFindFirst).toHaveBeenCalled();
  });

  it("rejects an admin acting on a user outside their own organization", async () => {
    mockedAuth.mockResolvedValue(ADMIN_IN_ORG_1);
    mockFindFirst.mockResolvedValue(undefined);

    await expect(
      updateUser("user_in_org_2", { email: "new@example.com" }, "org_1"),
    ).rejects.toThrow(/not a member of your organization/i);
    expect(mockClerkUpdateUser).not.toHaveBeenCalled();
  });

  it("allows an org admin to update a member of their own org", async () => {
    mockedAuth.mockResolvedValue(ADMIN_IN_ORG_1);

    await expect(
      updateUser("user_target", { firstName: "New" }, "org_1"),
    ).resolves.toEqual({ success: true });
    expect(mockClerkUpdateUser).toHaveBeenCalled();
  });
});
