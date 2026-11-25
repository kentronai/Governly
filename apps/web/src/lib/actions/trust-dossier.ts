"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, tenants, trustDossierTracked } from "@db";
import { getTrustDossierVendor } from "@/lib/trust-dossier/vendors";

async function resolveTenantForUser(tenantSlugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(or(eq(tenants.id, tenantSlugOrId), eq(tenants.slug, tenantSlugOrId)))
    .limit(1);
  if (!tenant) throw new Error("Tenant not found");
  // Tenants are Clerk organisations; only members of this org may read/write.
  if (orgId !== tenant.id) throw new Error("Not a member of this organisation");
  return { tenantId: tenant.id, userId };
}

export async function getTrackedVendorSlugs(tenantSlugOrId: string) {
  const { tenantId } = await resolveTenantForUser(tenantSlugOrId);
  const rows = await db
    .select({ slug: trustDossierTracked.vendorSlug })
    .from(trustDossierTracked)
    .where(
      and(
        eq(trustDossierTracked.tenantId, tenantId),
        isNull(trustDossierTracked.removedAt),
      ),
    );
  return rows.map((row) => row.slug);
}

export async function setVendorTracked(
  tenantSlugOrId: string,
  vendorSlug: string,
  tracked: boolean,
) {
  if (!getTrustDossierVendor(vendorSlug)) throw new Error("Unknown vendor");
  const { tenantId, userId } = await resolveTenantForUser(tenantSlugOrId);
  if (tracked) {
    await db
      .insert(trustDossierTracked)
      .values({ tenantId, vendorSlug, createdBy: userId })
      .onConflictDoUpdate({
        target: [trustDossierTracked.tenantId, trustDossierTracked.vendorSlug],
        set: { removedAt: null },
      });
  } else {
    // Soft-remove: the AI Trust Center report lists it as "previously used".
    await db
      .update(trustDossierTracked)
      .set({ removedAt: new Date().toISOString() })
      .where(
        and(
          eq(trustDossierTracked.tenantId, tenantId),
          eq(trustDossierTracked.vendorSlug, vendorSlug),
        ),
      );
  }
  return { tracked };
}

export async function trackVendors(
  tenantSlugOrId: string,
  vendorSlugs: string[],
) {
  const slugs = [...new Set(vendorSlugs)].filter((s) =>
    getTrustDossierVendor(s),
  );
  if (!slugs.length) return { tracked: 0 };
  const { tenantId, userId } = await resolveTenantForUser(tenantSlugOrId);
  await db
    .insert(trustDossierTracked)
    .values(
      slugs.map((vendorSlug) => ({ tenantId, vendorSlug, createdBy: userId })),
    )
    .onConflictDoUpdate({
      target: [trustDossierTracked.tenantId, trustDossierTracked.vendorSlug],
      set: { removedAt: null },
    });
  return { tracked: slugs.length };
}
