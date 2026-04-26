import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { db, memberships, tenants, users } from "@db";
import { eq } from "drizzle-orm";
import { generateSlug } from "@/db/tenant";

type SyncedTenant = typeof tenants.$inferSelect;

/**
 * Local development fallback for when Clerk webhooks are not configured.
 * Mirrors the authenticated Clerk user/org into the local Postgres tables.
 */
export async function ensureClerkMirror(): Promise<{
  userId: string | null;
  orgId: string | null;
  tenant: SyncedTenant | null;
}> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    return { userId: null, orgId: null, tenant: null };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const firstName = user?.firstName ?? null;
  const lastName = user?.lastName ?? null;
  const name =
    [firstName, lastName].filter(Boolean).join(" ").trim() || email || null;

  await db
    .insert(users)
    .values({
      id: userId,
      email,
      name,
      imageUrl: user?.imageUrl ?? null,
      firstName,
      lastName,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        name,
        imageUrl: user?.imageUrl ?? null,
        firstName,
        lastName,
        updatedAt: new Date().toISOString(),
      },
    });

  if (!orgId) {
    return { userId, orgId: null, tenant: null };
  }

  let tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, orgId),
  });

  if (!tenant) {
    const clerk = await clerkClient();
    const organization = await clerk.organizations.getOrganization({
      organizationId: orgId,
    });

    const publicMetadata = (organization.publicMetadata ?? {}) as Record<
      string,
      unknown
    >;

    const [createdTenant] = await db
      .insert(tenants)
      .values({
        id: organization.id,
        slug: organization.slug || generateSlug(organization.name),
        name: organization.name,
        plan:
          typeof publicMetadata.plan === "string"
            ? publicMetadata.plan
            : "free",
        metadata: publicMetadata,
        createdByKentron: Boolean(publicMetadata.createdByKentron),
        logoUrl: organization.imageUrl ?? null,
      })
      .onConflictDoUpdate({
        target: tenants.id,
        set: {
          slug: organization.slug || generateSlug(organization.name),
          name: organization.name,
          plan:
            typeof publicMetadata.plan === "string"
              ? publicMetadata.plan
              : "free",
          metadata: publicMetadata,
          createdByKentron: Boolean(publicMetadata.createdByKentron),
          logoUrl: organization.imageUrl ?? null,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();

    tenant = createdTenant;
  }

  await db
    .insert(memberships)
    .values({
      tenantId: orgId,
      userId,
      role: orgRole || "member",
      permissions: [],
    })
    .onConflictDoUpdate({
      target: [memberships.tenantId, memberships.userId],
      set: {
        role: orgRole || "member",
        permissions: [],
        updatedAt: new Date().toISOString(),
      },
    });

  return { userId, orgId, tenant };
}
