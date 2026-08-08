/** @jest-environment node */

/**
 * Regression tests for the privilege-escalation hole in resetUserPassword.
 *
 * Server actions compile to publicly callable POST endpoints, so the original
 * "is anyone signed in?" check meant any authenticated user could set the
 * password of any Clerk user in any tenant — including a Kentron admin — and
 * then sign in as them. These tests pin the three conditions that must hold
 * before Clerk is ever touched.
 */

const mockUpdateUser = jest.fn();
const mockFindFirst = jest.fn();

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
  clerkClient: jest.fn(async () => ({ users: { updateUser: mockUpdateUser } })),
}));
jest.mock("@db", () => ({
  db: { query: { memberships: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } } },
  users: {},
  memberships: {},
  auditEvents: {},
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/server/audit", () => ({ createAuditEvent: jest.fn() }));

import { auth } from "@clerk/nextjs/server";
import { resetUserPassword } from "./users";

const mockedAuth = auth as unknown as jest.Mock;

const ADMIN_IN_ORG_1 = { userId: "user_admin", orgId: "org_1", orgRole: "org:admin" };

describe("resetUserPassword authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: target IS a member of the caller's org.
    mockFindFirst.mockResolvedValue({ userId: "user_target", tenantId: "org_1" });
  });

  it("rejects a caller with no active organization", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1", orgId: null, orgRole: null });

    await expect(resetUserPassword("user_target", "hunter2")).rejects.toThrow(
      /active organization/i,
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects a non-admin member of the same organization", async () => {
    mockedAuth.mockResolvedValue({
      userId: "user_member",
      orgId: "org_1",
      orgRole: "org:member",
    });

    await expect(resetUserPassword("user_target", "hunter2")).rejects.toThrow(
      /admin role required/i,
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects an admin targeting a user in a different tenant", async () => {
    mockedAuth.mockResolvedValue(ADMIN_IN_ORG_1);
    // No membership row for this target within org_1.
    mockFindFirst.mockResolvedValue(undefined);

    await expect(resetUserPassword("user_in_org_2", "hunter2")).rejects.toThrow(
      /not a member of your organization/i,
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("does not reveal whether the target user exists", async () => {
    mockedAuth.mockResolvedValue(ADMIN_IN_ORG_1);
    mockFindFirst.mockResolvedValue(undefined);

    // Same message for a nonexistent id and a real id in another tenant, so the
    // action cannot be used to probe for valid user ids.
    const nonexistent = resetUserPassword("user_does_not_exist", "hunter2");
    const foreign = resetUserPassword("user_in_org_2", "hunter2");

    await expect(nonexistent).rejects.toThrow(
      /not a member of your organization/i,
    );
    await expect(foreign).rejects.toThrow(/not a member of your organization/i);
  });

  it("allows an org admin to reset a password for a member of their own org", async () => {
    mockedAuth.mockResolvedValue(ADMIN_IN_ORG_1);

    await expect(
      resetUserPassword("user_target", "hunter2"),
    ).resolves.toEqual({ success: true });

    expect(mockUpdateUser).toHaveBeenCalledWith("user_target", {
      password: "hunter2",
    });
  });

  it("accepts org:owner as an admin role", async () => {
    mockedAuth.mockResolvedValue({
      userId: "user_owner",
      orgId: "org_1",
      orgRole: "org:owner",
    });

    await expect(
      resetUserPassword("user_target", "hunter2"),
    ).resolves.toEqual({ success: true });
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  describe("self-service (resetting your own password)", () => {
    it("lets a plain member reset their own password without admin role", async () => {
      mockedAuth.mockResolvedValue({
        userId: "user_member",
        orgId: "org_1",
        orgRole: "org:member",
      });

      await expect(
        resetUserPassword("user_member", "newpass1"),
      ).resolves.toEqual({ success: true });
      expect(mockUpdateUser).toHaveBeenCalledWith("user_member", {
        password: "newpass1",
      });
      // Self-service never needs to check membership — it's the caller's own account.
      expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("lets a user with no active org selected reset their own password", async () => {
      mockedAuth.mockResolvedValue({
        userId: "user_member",
        orgId: null,
        orgRole: null,
      });
      // Falls back to the target's own membership row to attribute the audit event.
      mockFindFirst.mockResolvedValue({ userId: "user_member", tenantId: "org_1" });

      await expect(
        resetUserPassword("user_member", "newpass1"),
      ).resolves.toEqual({ success: true });
      expect(mockUpdateUser).toHaveBeenCalledWith("user_member", {
        password: "newpass1",
      });
    });

    it("still blocks a member from resetting a DIFFERENT member's password", async () => {
      mockedAuth.mockResolvedValue({
        userId: "user_member",
        orgId: "org_1",
        orgRole: "org:member",
      });

      await expect(
        resetUserPassword("user_target", "hunter2"),
      ).rejects.toThrow(/admin role required/i);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });
});
