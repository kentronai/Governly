import { notFound, redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, tenants } from "@db";
import { eq } from "drizzle-orm";

import { ServerErrorPage } from "@/components/error/CustomErrorPage";

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `org-${Date.now()}`;

export default async function Page() {
  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  if (!orgId) {
    redirect("/admin/client-onboarding");
  }

  let tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, orgId),
  });

  // Lazy-sync: Clerk knows about this org but our local DB doesn't yet
  // (webhook missed, was misconfigured, or fired before the tenants table
  // existed). Pull the org from Clerk and insert it so the user lands on
  // /{slug}/applications instead of a 404.
  if (!tenant) {
    try {
      const clerk = await clerkClient();
      const org = await clerk.organizations.getOrganization({
        organizationId: orgId,
      });
      const meta = (org.publicMetadata ?? {}) as Record<string, unknown>;
      await db
        .insert(tenants)
        .values({
          id: org.id,
          name: org.name,
          slug: org.slug || slugify(org.name),
          plan: (meta.plan as string) || "free",
          createdByKentron: Boolean(meta.createdByKentron),
          metadata: meta,
        })
        .onConflictDoUpdate({
          target: tenants.id,
          set: {
            name: org.name,
            slug: org.slug || slugify(org.name),
          },
        });
      tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, orgId),
      });
    } catch (err) {
      console.error("Lazy-sync tenant from Clerk failed:", err);
    }
  }

  if (!tenant) {
    return notFound();
  }

  redirect(`/${tenant.slug}/applications`);
}
