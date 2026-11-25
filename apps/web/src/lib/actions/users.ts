/**
 * Server actions for Users
 */

"use server";

import { headers } from "next/headers";
import { invitationEmail, sendEmail } from "@/lib/server/email";
import { db, users, memberships, auditEvents } from "@db";
import { eq, and, or, like, notInArray, desc, sql, inArray } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { createAuditEvent } from "@/lib/server/audit";
import {
  healPlaceholderEmails,
  isPlaceholderEmail,
} from "@/lib/server/user-identity";

interface GetUsersOptions {
  page?: number;
  pageSize?: number;
  search?: string;
}

// Same role set middleware treats as admin (see src/middleware.ts isUserAdmin).
const ADMIN_ORG_ROLES = ["org:admin", "admin", "org:owner"];

/**
 * Guard for privileged user-management actions.
 *
 * Server actions are publicly callable POST endpoints, so a signed-in check
 * alone is not access control: without this, any authenticated user could pass
 * an arbitrary Clerk user id and act on a member of a different tenant. This
 * asserts three things before any Clerk mutation runs:
 *   1. the caller has an active organization,
 *   2. the caller is an admin/owner of it, and
 *   3. the target user is a member of that same organization.
 *
 * Returns the caller id and the verified tenant id, so callers audit against
 * the tenant we actually checked rather than one looked up from the target.
 */
const requireOrgAdminOverTarget = async (
  targetUserId: string,
  { allowDeactivatedFromOrg = false } = {},
) => {
  const { userId: actorUserId, orgId, orgRole } = await auth();

  if (!actorUserId) {
    throw new Error("Authentication required");
  }

  if (!orgId) {
    throw new Error(
      "No active organization found. Please ensure you are logged into an organization.",
    );
  }

  if (!orgRole || !ADMIN_ORG_ROLES.includes(orgRole)) {
    throw new Error("Access denied: organization admin role required");
  }

  const targetMembership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, targetUserId),
      eq(memberships.tenantId, orgId),
    ),
  });

  // Deactivation deletes the local membership row, so for a reactivation the
  // proof the target belongs here is the "user.deactivated" audit event this
  // org recorded — the same signal getDeactivatedUsers lists them by.
  const deactivatedFromOrg =
    !targetMembership && allowDeactivatedFromOrg
      ? (
          await db
            .select({ id: auditEvents.id })
            .from(auditEvents)
            .where(
              and(
                eq(auditEvents.tenantId, orgId),
                eq(auditEvents.action, "user.deactivated"),
                eq(auditEvents.targetType, "user"),
                eq(auditEvents.targetId, targetUserId),
              ),
            )
            .limit(1)
        ).length > 0
      : false;

  if (!targetMembership && !deactivatedFromOrg) {
    // Deliberately the same message whether the user does not exist or belongs
    // to another tenant, so this cannot be used to probe for user ids.
    throw new Error("Access denied: user is not a member of your organization");
  }

  return { actorUserId, orgId };
};

/**
 * Guard for password resets specifically: resetting your OWN password never
 * requires an admin role — that's ordinary self-service, and requiring admin
 * here would just lock members out of changing their own password. Resetting
 * someone ELSE's password still goes through the full admin-over-target check.
 *
 * `orgId` in the return value may be null for the self-service path (a user
 * can act on their own account without an active org selected); callers that
 * need a tenant for auditing should fall back to a membership lookup.
 */
const requireCanResetPassword = async (targetUserId: string) => {
  const { userId: actorUserId, orgId } = await auth();

  if (!actorUserId) {
    throw new Error("Authentication required");
  }

  if (actorUserId === targetUserId) {
    return { actorUserId, orgId: orgId ?? null };
  }

  const admin = await requireOrgAdminOverTarget(targetUserId);
  return {
    actorUserId: admin.actorUserId,
    orgId: admin.orgId as string | null,
  };
};

interface CreateUserInput {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  password: string;
  role?: string;
  tenant_id: string;
}

interface UpdateUserInput {
  username?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: boolean;
  role?: string;
}

const memberLimitMessage = (limit: number) =>
  `Your free plan allows up to ${limit || 2} active members per organization. Remove a member or upgrade your plan to add more.`;

/**
 * Mirrors the Clerk organization's members into our users/memberships tables.
 * Covers anyone whose Clerk webhook was missed (e.g. the creator of a brand-new
 * organization), so the Active Users list always matches who can actually sign in.
 */
async function syncOrgMembersFromClerk(organizationId: string) {
  const clerk = await clerkClient();
  const members = (await clerk.organizations.getOrganizationMembershipList({ organizationId, limit: 100 })).data;
  const ids = members.map((m) => m.publicUserData?.userId).filter((id): id is string => !!id);
  if (!ids.length) return;
  const clerkUsers = (await clerk.users.getUserList({ userId: ids, limit: 100 })).data;
  for (const m of members) {
    const u = clerkUsers.find((c) => c.id === m.publicUserData?.userId);
    if (!u) continue;
    const email = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress;
    if (!email) continue;
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    await db
      .insert(users)
      .values({ id: u.id, email, name, firstName: u.firstName ?? "", lastName: u.lastName ?? "", imageUrl: u.imageUrl })
      .onConflictDoNothing();
    await db
      .insert(memberships)
      .values({ tenantId: organizationId, userId: u.id, role: m.role.replace(/^org:/, ""), permissions: [] })
      .onConflictDoNothing();
  }
}

/**
 * Create a new user and add them to the organization
 */
export const createUser = async (input: CreateUserInput) => {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new Error("Authentication required");
  }

  if (!orgId) {
    throw new Error(
      "No active organization found. Please ensure you are logged into an organization.",
    );
  }

  // Creating users (possibly admins, with a chosen password) is admin-only.
  if (!orgRole || !ADMIN_ORG_ROLES.includes(orgRole)) {
    throw new Error("Access denied: organization admin role required");
  }

  // Use orgId from auth context instead of input.tenant_id to ensure we're using the active organization
  const organizationId = orgId;

  try {
    const clerk = await clerkClient();

    // Verify organization exists in Clerk before proceeding
    try {
      const organization = await clerk.organizations.getOrganization({
        organizationId: organizationId,
      });
      if (!organization) {
        throw new Error(
          `Organization with ID ${organizationId} not found in Clerk`,
        );
      }
    } catch (orgError: any) {
      if (orgError.status === 404 || orgError.message?.includes("not found")) {
        throw new Error(
          `Organization not found in Clerk. Please ensure you are logged into a valid organization. Organization ID: ${organizationId}`,
        );
      }
      throw orgError;
    }

    // Plan limit: tell the admin plainly instead of surfacing Clerk's raw error.
    const org = await clerk.organizations.getOrganization({ organizationId });
    const limit = org.maxAllowedMemberships;
    if (limit > 0) {
      const members = await clerk.organizations.getOrganizationMembershipList({
        organizationId,
        limit: 1,
      });
      if (members.totalCount >= limit)
        return { error: memberLimitMessage(limit) };
    }

    // Create user in Clerk
    const firstName =
      input.firstName || (input.name ? input.name.split(" ")[0] : "");
    const lastName =
      input.lastName ||
      (input.name ? input.name.split(" ").slice(1).join(" ") : "");
    const clerkUser = await clerk.users.createUser({
      emailAddress: [input.email],
      firstName: firstName || "User",
      lastName: lastName || "",
      password: input.password,
      skipPasswordChecks: false,
    });

    // Add user to organization in Clerk
    // Convert role format to Clerk format (org:member, org:admin)
    const clerkRole = input.role
      ? input.role === "admin" || input.role === "org:admin"
        ? "org:admin"
        : input.role === "member" || input.role === "org:member"
          ? "org:member"
          : input.role.startsWith("org:")
            ? input.role
            : `org:${input.role}`
      : "org:member";

    try {
      await clerk.organizations.createOrganizationMembership({
        organizationId: organizationId,
        userId: clerkUser.id,
        role: clerkRole,
      });
    } catch (membershipError: any) {
      // If adding to organization fails, we should clean up the created user
      // But only if it's a critical error (not a duplicate membership)
      if (membershipError.errors?.[0]?.code === "organization_membership_quota_exceeded") {
        // Don't leave an orphan Clerk user behind (it would block re-adding this email).
        await clerk.users.deleteUser(clerkUser.id).catch(() => {});
        return { error: memberLimitMessage(0) };
      }
      if (membershipError.status === 404) {
        throw new Error(
          `Failed to add user to organization: Organization ${organizationId} not found. User was created but not added to organization.`,
        );
      }
      // If it's a duplicate membership error, that's okay - user is already in org
      if (
        membershipError.status === 409 ||
        membershipError.errors?.[0]?.code === "duplicate_record"
      ) {
      } else {
        throw membershipError;
      }
    }

    // Create or update user in local database
    const dbFirstName = input.firstName || clerkUser.firstName || "";
    const dbLastName = input.lastName || clerkUser.lastName || "";
    const dbName =
      input.name ||
      `${dbFirstName} ${dbLastName}`.trim() ||
      `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim();
    const [localUser] = await db
      .insert(users)
      .values({
        id: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress || input.email,
        name: dbName,
        firstName: dbFirstName,
        lastName: dbLastName,
        imageUrl: clerkUser.imageUrl,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: clerkUser.emailAddresses[0]?.emailAddress || input.email,
          name: dbName,
          firstName: dbFirstName,
          lastName: dbLastName,
          imageUrl: clerkUser.imageUrl,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    // Create membership record using the organizationId from auth context
    const [membership] = await db
      .insert(memberships)
      .values({
        tenantId: organizationId,
        userId: clerkUser.id,
        role: input.role || "member",
        permissions: [],
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: {
          role: input.role || "member",
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    revalidatePath("/admin/users");

    try {
      await createAuditEvent({
        tenantId: organizationId,
        actorUserId: userId,
        action: "user.created",
        targetType: "user",
        targetId: clerkUser.id,
        metadata: { email: input.email, role: input.role || "member" },
      });
    } catch (e) {
      console.error("Failed to write audit event (user.created):", e);
    }

    // Invitation email (best effort: the user exists either way).
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const mail = invitationEmail({
      orgName: (await clerk.organizations.getOrganization({ organizationId })).name,
      firstName: dbFirstName || "there",
      email: localUser.email,
      loginUrl: `${host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-in`,
    });
    const emailResult = await sendEmail({ to: localUser.email, ...mail });
    if (!emailResult.sent) console.error("Invitation email not sent:", emailResult.reason);

    return {
      id: localUser.id,
      name: localUser.name || "",
      email: localUser.email,
      role: membership.role,
      status: true,
      emailSent: emailResult.sent,
    };
  } catch (error: any) {
    console.error("Error creating user:", error);

    // Extract detailed error message from Clerk
    let errorMessage = "Failed to create user";

    if (
      error.errors &&
      Array.isArray(error.errors) &&
      error.errors.length > 0
    ) {
      // Clerk returns detailed validation errors
      const errorMessages = error.errors
        .map((err: any) => {
          if (err.message) return err.message;
          if (err.longMessage) return err.longMessage;
          return JSON.stringify(err);
        })
        .filter(Boolean);

      if (errorMessages.length > 0) {
        errorMessage = errorMessages.join("; ");
      } else if (error.message) {
        errorMessage = error.message;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Add more context for common issues
    if (error.status === 422) {
      errorMessage = `Invalid user data: ${errorMessage}`;
    } else if (error.status === 404) {
      errorMessage = `Organization not found: ${errorMessage}. Please ensure you are logged into a valid organization.`;
    }

    // Return instead of throw: production builds strip thrown server-action
    // messages, so the user would only see a generic "Server Components" error.
    return { error: errorMessage };
  }
};

/**
 * Update user details
 */
export const updateUser = async (
  userId: string,
  input: UpdateUserInput,
  _tenantId: string,
) => {
  // _tenantId is caller-supplied and untrusted — the original code used it
  // directly for every Clerk org call and local-DB write below, so any
  // signed-in user could pass someone else's org id and change that user's
  // email (an account-takeover path: change the email, then use the normal
  // forgot-password flow) or their membership/role. Re-deriving the tenant
  // from the actor's own verified admin membership closes that, matching how
  // createUser already ignores input.tenant_id in favor of auth()'s orgId.
  // Only admin/admin-management pages call this action (see
  // admin/users/active and admin/users/deactivate) — there is no self-service
  // "edit my own profile" caller, so admin-only gating doesn't remove any
  // legitimate capability.
  const { actorUserId, orgId: tenantId } = await requireOrgAdminOverTarget(
    userId,
    // Reactivation of someone this org deactivated; never an email change.
    { allowDeactivatedFromOrg: input.status === true && !input.email },
  );

  try {
    const clerk = await clerkClient();

    // Update user in Clerk if needed
    if (
      input.firstName !== undefined ||
      input.lastName !== undefined ||
      input.name ||
      input.email
    ) {
      const updateData: any = {};
      if (input.firstName !== undefined || input.lastName !== undefined) {
        // Get existing Clerk user data to preserve fields not being updated
        const existingClerkUser = await clerk.users.getUser(userId);
        updateData.firstName =
          input.firstName !== undefined
            ? input.firstName
            : existingClerkUser.firstName || "";
        updateData.lastName =
          input.lastName !== undefined
            ? input.lastName
            : existingClerkUser.lastName || "";
      } else if (input.name) {
        const nameParts = input.name.split(" ");
        updateData.firstName = nameParts[0] || input.name;
        updateData.lastName = nameParts.slice(1).join(" ") || "";
      }
      if (input.email) {
        updateData.emailAddress = [input.email];
      }
      await clerk.users.updateUser(userId, updateData);
    }

    // Update membership status (add/remove from organization)
    if (input.status !== undefined) {
      try {
        if (input.status) {
          // Activating user: unlock in Clerk and add to organization
          try {
            // Unlock user in Clerk (set banned to false)
            await (clerk.users.updateUser as any)(userId, {
              banned: false,
            });
          } catch (unlockError: any) {
            console.error("Failed to unlock user in Clerk:", unlockError);
            // Continue with activation even if unlock fails
          }

          // Determine the role to use for Clerk (convert to Clerk format)
          const clerkRole = input.role
            ? input.role === "admin" || input.role === "org:admin"
              ? "org:admin"
              : input.role === "member" || input.role === "org:member"
                ? "org:member"
                : input.role.startsWith("org:")
                  ? input.role
                  : `org:${input.role}`
            : "org:member";

          // Always try to add user back to organization in Clerk
          // First, check if membership already exists
          let membershipExistsInClerk = false;
          try {
            const orgMemberships =
              await clerk.organizations.getOrganizationMembershipList({
                organizationId: tenantId,
              });
            membershipExistsInClerk = orgMemberships.data.some(
              (membership: any) => membership.publicUserData?.userId === userId,
            );
          } catch (checkError: any) {
            console.log(
              `Could not check existing membership, will attempt to create:`,
              checkError.message,
            );
          }

          // If membership doesn't exist, create it
          if (!membershipExistsInClerk) {
            try {
              await clerk.organizations.createOrganizationMembership({
                organizationId: tenantId,
                userId: userId,
                role: clerkRole,
              });
              membershipExistsInClerk = true;
            } catch (createError: any) {
              // If membership already exists (403 Forbidden or 409 Conflict), try to update it
              if (
                createError.status === 403 ||
                createError.status === 409 ||
                createError.errors?.[0]?.code === "duplicate_record" ||
                createError.message?.includes("already exists") ||
                createError.message?.includes("duplicate")
              ) {
                try {
                  await clerk.organizations.updateOrganizationMembership({
                    organizationId: tenantId,
                    userId: userId,
                    role: clerkRole,
                  });
                  membershipExistsInClerk = true;
                } catch (updateError: any) {
                  console.error("Failed to update role in Clerk:", updateError);
                  // Verify membership exists by checking Clerk again
                  try {
                    const orgMemberships =
                      await clerk.organizations.getOrganizationMembershipList({
                        organizationId: tenantId,
                      });
                    membershipExistsInClerk = orgMemberships.data.some(
                      (membership: any) =>
                        membership.publicUserData?.userId === userId,
                    );
                    if (membershipExistsInClerk) {
                    } else {
                      throw new Error(
                        `User ${userId} is NOT a member of organization ${tenantId} in Clerk after update attempt`,
                      );
                    }
                  } catch (verifyError: any) {
                    throw new Error(
                      `Failed to add user to organization in Clerk: ${verifyError.message || "Unknown error"}`,
                    );
                  }
                }
              } else {
                // If it's a different error, throw it
                throw new Error(
                  `Failed to add user to organization in Clerk: ${createError.message || "Unknown error"}`,
                );
              }
            }
          } else {
            // Membership exists, just update the role if needed
            try {
              await clerk.organizations.updateOrganizationMembership({
                organizationId: tenantId,
                userId: userId,
                role: clerkRole,
              });
            } catch (updateError: any) {
              console.error(
                "Failed to update role in Clerk (membership exists):",
                updateError,
              );
              // Non-critical, continue
            }
          }

          if (!membershipExistsInClerk) {
            throw new Error(
              `Failed to add user ${userId} to organization ${tenantId} in Clerk`,
            );
          }

          // Always ensure membership record exists in local database
          // This is critical - it determines if user shows up in active users list
          // Convert Clerk role format back to internal format for storage
          const internalRole = input.role || "member";

          try {
            const [membershipRecord] = await db
              .insert(memberships)
              .values({
                tenantId: tenantId,
                userId: userId,
                role: internalRole,
                permissions: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              .onConflictDoUpdate({
                target: [memberships.tenantId, memberships.userId],
                set: {
                  role: internalRole,
                  updatedAt: new Date().toISOString(),
                },
              })
              .returning();

            if (!membershipRecord) {
              throw new Error(
                `Failed to create membership record in local database for user ${userId}`,
              );
            }

            // Verify the membership was actually created by querying it back
            const verifyMembership = await db.query.memberships.findFirst({
              where: and(
                eq(memberships.tenantId, tenantId),
                eq(memberships.userId, userId),
              ),
            });

            if (!verifyMembership) {
              throw new Error(
                `Membership record verification failed for user ${userId} in tenant ${tenantId}`,
              );
            }

            console.log(
              `✅ Verified membership record exists in local database for user ${userId}`,
            );
          } catch (dbError: any) {
            console.error(
              "Failed to create/verify membership record in local database:",
              dbError,
            );
            throw new Error(
              `Failed to create membership record: ${dbError.message || "Unknown error"}`,
            );
          }
        } else {
          // Deactivating user: lock in Clerk and remove from organization
          try {
            // Lock user in Clerk (set banned to true)
            // Note: Clerk uses 'banned' property but TypeScript types may not include it
            await (clerk.users.updateUser as any)(userId, {
              banned: true,
            });
          } catch (lockError: any) {
            console.error("Failed to lock user in Clerk:", lockError);
            // Continue with deactivation even if lock fails
          }

          // Remove user from organization
          try {
            await clerk.organizations.deleteOrganizationMembership({
              organizationId: tenantId,
              userId: userId,
            });
          } catch (deleteError: any) {
            // If membership doesn't exist, that's okay
            if (
              deleteError.status === 404 ||
              deleteError.message?.includes("not found")
            ) {
              console.log(
                `Membership not found for user ${userId} in organization ${tenantId}, skipping deletion`,
              );
            } else {
              throw deleteError;
            }
          }

          // Remove membership record from local database
          await db
            .delete(memberships)
            .where(
              and(
                eq(memberships.tenantId, tenantId),
                eq(memberships.userId, userId),
              ),
            );
        }
      } catch (e: any) {
        // Log the error
        console.error("Error managing organization membership:", e);
        // Always re-throw errors during activation/deactivation to ensure user gets feedback
        // Only skip throwing for non-critical Clerk API errors (like membership already exists/deleted)
        if (input.status === true) {
          // During activation, we must ensure membership is created - throw all errors
          throw e;
        } else if (input.status === false) {
          // During deactivation, only throw if it's not a "not found" error
          if (e.status !== 404 && !e.message?.includes("not found")) {
            throw e;
          }
        } else {
          // For other operations, only throw critical errors
          if (e.status !== 403 && e.status !== 404 && e.status !== 409) {
            throw e;
          }
        }
      }
    }

    // Update role if provided AND user is active (has membership)
    // Only update role if status is NOT being changed (separate role update operation)
    // If status is being set to true, role is already handled in the activation block above
    if (input.role && input.status === undefined) {
      // Check if membership exists first
      const existingMembership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.userId, userId),
        ),
      });

      if (existingMembership) {
        // Convert role to Clerk format
        const clerkRole =
          input.role === "admin" || input.role === "org:admin"
            ? "org:admin"
            : input.role === "member" || input.role === "org:member"
              ? "org:member"
              : input.role.startsWith("org:")
                ? input.role
                : `org:${input.role}`;

        // Update role in Clerk
        try {
          await clerk.organizations.updateOrganizationMembership({
            organizationId: tenantId,
            userId: userId,
            role: clerkRole,
          });
        } catch (e) {
          console.error("Failed to update role in Clerk:", e);
        }

        // Update role in local database
        await db
          .update(memberships)
          .set({
            role: input.role,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(memberships.tenantId, tenantId),
              eq(memberships.userId, userId),
            ),
          );
      }
    }

    // Update user in local database
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    // Get existing user data if we need to preserve firstName/lastName
    let existingUser = null;
    if (
      (input.firstName !== undefined || input.lastName !== undefined) &&
      !input.name
    ) {
      existingUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
    }

    if (input.firstName !== undefined) {
      updateData.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      updateData.lastName = input.lastName;
    }
    if (input.name) {
      updateData.name = input.name;
    } else if (input.firstName !== undefined || input.lastName !== undefined) {
      // Update name from firstName and lastName if name not provided
      const firstName =
        input.firstName !== undefined
          ? input.firstName
          : existingUser?.firstName || "";
      const lastName =
        input.lastName !== undefined
          ? input.lastName
          : existingUser?.lastName || "";
      updateData.name = `${firstName} ${lastName}`.trim();
    }
    if (input.email) {
      updateData.email = input.email;
    }

    if (Object.keys(updateData).length > 1) {
      await db.update(users).set(updateData).where(eq(users.id, userId));
    }

    revalidatePath("/admin/users");

    try {
      // Determine the appropriate action based on status change
      let action = "user.updated";
      if (input.status !== undefined) {
        action = input.status ? "user.activated" : "user.deactivated";
      }

      await createAuditEvent({
        tenantId: tenantId,
        actorUserId: actorUserId,
        action: action,
        targetType: "user",
        targetId: userId,
        metadata: {
          update: input,
          lockedInClerk: input.status === false,
          unlockedInClerk: input.status === true,
        },
      });
    } catch (e) {
      console.error(
        `Failed to write audit event (${input.status !== undefined ? (input.status ? "user.activated" : "user.deactivated") : "user.updated"}):`,
        e,
      );
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error updating user:", error);
    throw new Error(error.message || "Failed to update user");
  }
};

/**
 * Reset user password
 */
export const resetUserPassword = async (
  userId: string,
  newPassword: string,
) => {
  // Must run before any Clerk mutation: allows a user to reset their OWN
  // password freely, but requires org-admin-over-target for anyone else's —
  // see requireCanResetPassword for why self-service is a separate path.
  const { actorUserId, orgId } = await requireCanResetPassword(userId);

  try {
    const clerk = await clerkClient();

    await clerk.users.updateUser(userId, {
      password: newPassword,
    });

    // Optionally create audit event. Self-service resets may not have an
    // active org in the auth context, so fall back to the target's own
    // membership row to still attribute the event to a tenant.
    try {
      const auditTenantId =
        orgId ??
        (
          await db.query.memberships.findFirst({
            where: eq(memberships.userId, userId),
          })
        )?.tenantId;

      if (auditTenantId) {
        await createAuditEvent({
          tenantId: auditTenantId,
          actorUserId: actorUserId,
          action: "user.password_reset",
          targetType: "user",
          targetId: userId,
        });
      }
    } catch (e) {
      console.error("Failed to write audit event (user.password_reset):", e);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error resetting password:", error);
    throw new Error(error.message || "Failed to reset password");
  }
};

/**
 * Get active users for a tenant
 * Active users are those who have a membership record
 */
export const getActiveUsers = async (options?: GetUsersOptions) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Unauthorized");
  }

  const { page = 1, pageSize = 20, search } = options || {};
  const offset = (page - 1) * pageSize;

  await syncOrgMembersFromClerk(orgId).catch((e) => console.error("Member sync failed:", e));

  // Build search condition
  const searchConditions = search
    ? [like(users.name, `%${search}%`), like(users.email, `%${search}%`)]
    : [];

  const whereConditions = [
    eq(memberships.tenantId, orgId),
    ...(searchConditions.length > 0 ? [or(...searchConditions)] : []),
  ];

  // Query users with their membership data
  const results = await db
    .select({
      id: users.id,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      imageUrl: users.imageUrl,
      role: memberships.role,
      permissions: memberships.permissions,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      membershipCreatedAt: memberships.createdAt,
      membershipUpdatedAt: memberships.updatedAt,
    })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(and(...whereConditions))
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .innerJoin(memberships, eq(users.id, memberships.userId))
    .where(and(...whereConditions));

  const total = Number(countResult[0]?.count || 0);

  const healedEmails = await healPlaceholderEmails(results);
  for (const user of results) {
    user.email = healedEmails.get(user.id) ?? user.email;
  }

  return {
    success: true,
    users: results.map((user) => ({
      id: user.id,
      name:
        user.name ||
        (user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || user.lastName || ""),
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email,
      imageUrl: user.imageUrl,
      role: user.role || "member",
      permissions: user.permissions || [],
      status: true,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      clerkId: user.id,
      tenant: orgId,
      username:
        user.name ||
        (user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || user.lastName || user.email.split("@")[0]),
    })),
    counts: total,
  };
};

/**
 * Get organization members for a tenant/organization
 */
export const getOrganizationMembers = async (tenantId: string) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Unauthorized");
  }

  // Verify the tenant matches the user's organization
  if (tenantId !== orgId) {
    throw new Error("Access denied");
  }

  // Import dynamically to avoid circular dependencies
  const { getOrganizationMembers: getOrgMembers } = await import(
    "@/db/organization"
  );

  // Fetch organization members
  const orgMembers = await getOrgMembers(orgId);

  // Clerk's `identifier` is the sign-in identifier, which is a username or an
  // opaque id for SSO/username accounts — not necessarily an email. Prefer the
  // real email from our users table.
  const memberIds = orgMembers
    .map((member) => member.publicUserData?.userId)
    .filter((id): id is string => !!id);
  const localUsers = memberIds.length
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, memberIds))
    : [];
  const healedEmails = await healPlaceholderEmails(localUsers);
  const emailById = new Map(
    localUsers
      .map((u) => [u.id, healedEmails.get(u.id) ?? u.email] as const)
      .filter(([, email]) => !isPlaceholderEmail(email)),
  );

  // Transform Clerk members to simple format
  const availableUsers = orgMembers.map((member) => {
    const user = member.publicUserData;
    const identifier = user?.identifier ?? "";
    return {
      id: user?.userId ?? "",
      name:
        user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : identifier || "Unknown",
      email:
        emailById.get(user?.userId ?? "") ??
        (identifier.includes("@") ? identifier : ""),
      imageUrl: user?.imageUrl ?? "",
    };
  });

  return {
    success: true,
    data: availableUsers,
  };
};

/**
 * Get deactivated users for a tenant
 * Deactivated users are those who don't have an active membership
 */
export const getDeactivatedUsers = async (options?: GetUsersOptions) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Unauthorized");
  }

  const { page = 1, pageSize = 20, search } = options || {};
  const offset = (page - 1) * pageSize;

  // Get user IDs that were deactivated from this specific tenant
  // Query audit events to find users deactivated from this tenant
  const deactivationEvents = await db
    .select({ targetId: auditEvents.targetId })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, orgId),
        eq(auditEvents.action, "user.deactivated"),
        eq(auditEvents.targetType, "user"),
      ),
    );

  const deactivatedUserIds = deactivationEvents
    .map((e) => e.targetId)
    .filter((id): id is string => id !== null && id !== undefined);

  // If no users were deactivated from this tenant, return empty results
  if (deactivatedUserIds.length === 0) {
    return {
      success: true,
      users: [],
      counts: 0,
    };
  }

  // Get all user IDs that have active memberships (to exclude reactivated users)
  const activeMemberships = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.tenantId, orgId));

  const activeUserIds = activeMemberships.map((m) => m.userId);

  // Filter out users that have been reactivated (have active membership)
  const trulyDeactivatedUserIds = deactivatedUserIds.filter(
    (id) => !activeUserIds.includes(id),
  );

  // If all deactivated users have been reactivated, return empty results
  if (trulyDeactivatedUserIds.length === 0) {
    return {
      success: true,
      users: [],
      counts: 0,
    };
  }

  // Build search conditions
  const searchConditions = search
    ? [like(users.name, `%${search}%`), like(users.email, `%${search}%`)]
    : [];

  const whereConditions = [
    // Only users that were deactivated from this tenant
    inArray(users.id, trulyDeactivatedUserIds),
    ...(searchConditions.length > 0 ? [or(...searchConditions)] : []),
  ];

  // Query deactivated users
  const results = await db
    .select({
      id: users.id,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      imageUrl: users.imageUrl,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(...whereConditions))
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(...whereConditions));

  const total = Number(countResult[0]?.count || 0);

  return {
    success: true,
    users: results.map((user) => ({
      id: user.id,
      name:
        user.name ||
        (user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || user.lastName || ""),
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email,
      imageUrl: user.imageUrl,
      role: "member",
      status: false,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      clerkId: user.id,
      tenant: orgId,
      username:
        user.name ||
        (user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.firstName || user.lastName || user.email.split("@")[0]),
    })),
    counts: total,
  };
};

/** id -> display name (name or email) for members of the caller's org; used by RecordMetadata. */
export async function getUserDisplayNames(ids: string[]): Promise<Record<string, string>> {
  const { userId, orgId } = await auth();
  const wanted = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!userId || !orgId || !wanted.length) return {};
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.tenantId, orgId)))
    .where(inArray(users.id, wanted));
  return Object.fromEntries(rows.map((u) => [u.id, u.name || u.email]));
}
