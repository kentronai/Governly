"use server";

/**
 * Tenant-wide default runtime policy.
 *
 * The policy flagged `is_tenant_default` is what the ControlNet gateway
 * enforces on any API-key traffic whose application has no policy of its own
 * (see apps/controlnet .../application_policy_service.py). Enabling one here is
 * the "turn it on once, it applies everywhere" control; per-application
 * policies still take precedence where they are set.
 */

import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, policies, tenants } from "@db";

async function requireTenant(tenantSlugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!rows.length) {
    rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!rows.length || rows[0].id !== orgId) {
    throw new Error("Tenant access denied");
  }
  return { tenantId: orgId, userId };
}

export interface TenantPolicyRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isTenantDefault: boolean;
  updatedAt: string;
}

/** Lists the tenant's runtime policies for the policy management screen. */
export async function fetchTenantPolicies(
  tenantSlugOrId: string,
): Promise<TenantPolicyRow[]> {
  const { tenantId } = await requireTenant(tenantSlugOrId);
  const rows = await db
    .select({
      id: policies.id,
      name: policies.name,
      description: policies.description,
      isActive: policies.isActive,
      isTenantDefault: policies.isTenantDefault,
      updatedAt: policies.updatedAt,
    })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), isNull(policies.deletedAt)))
    .orderBy(policies.name);
  return rows;
}

/**
 * Sets (or clears) the tenant-wide default policy. Enabling one policy clears
 * the flag on every other policy so there is always at most one default.
 */
export async function setTenantDefaultPolicy(
  tenantSlugOrId: string,
  policyId: string,
  enabled: boolean,
) {
  const { tenantId, userId } = await requireTenant(tenantSlugOrId);

  // The policy must belong to this tenant.
  const target = await db.query.policies.findFirst({
    where: and(eq(policies.id, policyId), eq(policies.tenantId, tenantId)),
  });
  if (!target) throw new Error("Policy not found");

  const now = new Date().toISOString();
  if (enabled) {
    // Clear any existing default for this tenant, then set the chosen one.
    await db
      .update(policies)
      .set({ isTenantDefault: false, updatedAt: now, updatedBy: userId })
      .where(
        and(
          eq(policies.tenantId, tenantId),
          eq(policies.isTenantDefault, true),
          ne(policies.id, policyId),
        ),
      );
    await db
      .update(policies)
      .set({
        isTenantDefault: true,
        isActive: true,
        updatedAt: now,
        updatedBy: userId,
      })
      .where(eq(policies.id, policyId));
  } else {
    await db
      .update(policies)
      .set({ isTenantDefault: false, updatedAt: now, updatedBy: userId })
      .where(eq(policies.id, policyId));
  }

  revalidatePath(`/${tenantSlugOrId}/policies`);
  return { policyId, enabled };
}
