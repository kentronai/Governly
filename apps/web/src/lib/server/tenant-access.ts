import { auth } from "@clerk/nextjs/server";
import { and, eq, or } from "drizzle-orm";
import { applications, db, tenants } from "@db";

/** Same role set middleware treats as admin (see src/middleware.ts isUserAdmin). */
const ADMIN_ORG_ROLES = ["org:admin", "admin", "org:owner"];

/**
 * Server actions are public POST endpoints: never trust a tenant slug/id sent by the
 * browser. Resolve it, then require it to be the caller's active Clerk org (tenants
 * are Clerk organisations). Throws if not signed in or not a member.
 */
export async function requireTenantMember(tenantSlugOrId: string) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  if (!tenantSlugOrId) throw new Error("Tenant access denied");
  const [tenant] = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(or(eq(tenants.id, tenantSlugOrId), eq(tenants.slug, tenantSlugOrId)))
    .limit(1);
  if (!tenant || tenant.id !== orgId) throw new Error("Tenant access denied");
  return { tenantId: tenant.id, tenantSlug: tenant.slug, userId, orgRole };
}

/** requireTenantMember + the application must belong to that tenant. */
export async function requireTenantApplication(
  tenantSlugOrId: string,
  applicationId: string,
) {
  const ctx = await requireTenantMember(tenantSlugOrId);
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.tenantId, ctx.tenantId)))
    .limit(1);
  if (!app) throw new Error("Application not found");
  return ctx;
}

/** Caller's own active org, for actions that don't take a tenant argument. */
export async function requireActiveTenant() {
  const { orgId } = await auth();
  return requireTenantMember(orgId ?? "");
}

export function isOrgAdminRole(orgRole: string | null | undefined) {
  return !!orgRole && ADMIN_ORG_ROLES.includes(orgRole);
}
