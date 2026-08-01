// src/app/[tenant]/layout.tsx
import { headers } from "next/headers";
import { ReactNode } from "react";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db, tenants, users, withDbRetry } from "@db";
import { eq } from "drizzle-orm";
import { TenantProvider } from "@/contexts/TenantContext";
import LayoutWithConditionalSidebar from "@/components/app/LayoutWithConditionalSidebar";
import { TenantHeader } from "@/components/app/TenantHeader";
import { UserGuideModal } from "@/components/common/UserGuided";
import { Providers } from "../providers";

const tenantRouteAliases = new Set([
  "admin",
  "ai-catalog",
  "ai-console",
  "ai-risk-center",
  "api-keys",
  "applications",
  "control-net",
  "guardrails",
  "model-guard",
  "model-registry",
  "observability",
  "playground",
  "policies",
  "red-teaming",
  "reports",
]);

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `org-${Date.now()}`;

const getClaimEmail = (sessionClaims: unknown): string | null => {
  if (!sessionClaims || typeof sessionClaims !== "object") {
    return null;
  }

  const claims = sessionClaims as Record<string, unknown>;
  const directEmail = claims.email;
  if (typeof directEmail === "string" && directEmail.trim()) {
    return directEmail;
  }

  const primaryEmail = claims.primary_email;
  if (typeof primaryEmail === "string" && primaryEmail.trim()) {
    return primaryEmail;
  }

  return null;
};

const getLocalUserEmail = async (userId: string): Promise<string | null> => {
  try {
    const localUser = await withDbRetry(() =>
      db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { email: true },
      }),
    );

    return localUser?.email ?? null;
  } catch {
    return null;
  }
};

async function ensureTenantForOrg(orgId: string) {
  let tenant = await withDbRetry(() =>
    db.query.tenants.findFirst({
      where: eq(tenants.id, orgId),
    }),
  );

  if (tenant) {
    return tenant;
  }

  const clerk = await clerkClient();
  const org = await clerk.organizations.getOrganization({
    organizationId: orgId,
  });
  const metadata = (org.publicMetadata ?? {}) as Record<string, unknown>;

  try {
    await db
      .insert(tenants)
      .values({
        id: org.id,
        name: org.name,
        slug: org.slug || slugify(org.name),
        plan: (metadata.plan as string) || "free",
        createdByKentron: Boolean(metadata.createdByKentron),
        metadata,
      })
      .onConflictDoUpdate({
        target: tenants.id,
        set: {
          name: org.name,
          slug: org.slug || slugify(org.name),
        },
      });
  } catch (error: any) {
    // Parallel RSC requests can both observe the tenant as missing and race to
    // insert it. If the other request won, reuse that row instead of turning a
    // harmless unique-constraint race into a failed page render.
    const postgresCode = error?.cause?.code || error?.code;
    if (postgresCode === "23505") {
      const concurrentlyCreatedTenant = await withDbRetry(() =>
        db.query.tenants.findFirst({
          where: eq(tenants.id, orgId),
        }),
      );
      if (concurrentlyCreatedTenant) {
        return concurrentlyCreatedTenant;
      }
    }
    throw error;
  }

  return withDbRetry(() =>
    db.query.tenants.findFirst({
      where: eq(tenants.id, orgId),
    }),
  );
}

// Users are supposed to land in the local `users` table via the Clerk user
// webhook, but that webhook can be misconfigured or simply not have fired yet
// on a fresh environment — and it never back-fills people who signed up before
// it was wired up. Tenants already self-heal on access via ensureTenantForOrg;
// do the same for the signed-in user so every feature that references `users`
// (integrations, applications, audit ownership, …) works regardless of webhook
// delivery. Idempotent: only writes when the row is missing.
async function ensureUserRow(userId: string) {
  const existing = await withDbRetry(() =>
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    }),
  );
  if (existing) return;

  const clerkUser = await currentUser();
  const name =
    `${clerkUser?.firstName || ""} ${clerkUser?.lastName || ""}`.trim() ||
    clerkUser?.username ||
    null;
  const email =
    clerkUser?.emailAddresses?.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ||
    clerkUser?.emailAddresses?.[0]?.emailAddress ||
    `${userId}@unknown.local`;

  await withDbRetry(() =>
    db
      .insert(users)
      .values({
        id: userId,
        email,
        name,
        imageUrl: clerkUser?.imageUrl || null,
      })
      .onConflictDoNothing({ target: users.id }),
  );
}

interface TenantLayoutProps {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function TenantLayout({
  children,
  params,
}: TenantLayoutProps) {
  const headersList = await headers();
  const { tenant: tenantSlug } = await params;
  const { userId, orgId, sessionClaims } = await auth();

  const pathname =
    headersList.get("x-pathname") || headersList.get("referer") || "";

  // Redirect to sign-in if not authenticated
  if (!userId) {
    redirect("/sign-in");
  }

  // Self-heal the local user row (see ensureUserRow) before rendering any tenant
  // page, so features that stamp `created_by`/ownership against `users` work
  // even when the Clerk webhook hasn't synced this user.
  await ensureUserRow(userId);

  const userEmail =
    (await getLocalUserEmail(userId)) ?? getClaimEmail(sessionClaims);
  const isAdminUser = userEmail?.toLowerCase().endsWith("@kentron.ai") ?? false;

  // Find tenant by slug
  const tenant = await withDbRetry(() =>
    db.query.tenants.findFirst({
      where: eq(tenants.slug, tenantSlug),
    }),
  );

  // Redirect if tenant not found
  if (!tenant) {
    const activeTenant = orgId ? await ensureTenantForOrg(orgId) : null;

    if (activeTenant && tenantRouteAliases.has(tenantSlug)) {
      redirect(`/${activeTenant.slug}/${tenantSlug}`);
    }

    redirect("/");
  }

  // Verify user has access to this tenant
  if (tenant.id !== orgId) {
    redirect("/unauthorized?reason=tenant-access-denied");
  }

  return (
    // Providers must sit outside TenantProvider: TenantProvider calls useQuery
    // and therefore needs the QueryClientProvider to already be mounted above it.
    <Providers>
      <TenantProvider
        tenantData={{
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          plan: tenant.plan,
          govIQEnabled: tenant.govIqEnabled || false,
          controlnetEnabled: tenant.controlnetEnabled || true,
          metadata: tenant.metadata,
        }}
      >
        <div
          className="tenant-layout h-screen flex flex-col overflow-hidden relative"
          data-tenant-id={tenant.id}
          data-tenant-slug={tenant.slug}
        >
          <UserGuideModal></UserGuideModal>
          {/* Top Header */}
          <TenantHeader />
          {/* Layout with conditional sidebar */}
          <LayoutWithConditionalSidebar isAdminUser={isAdminUser}>
            {children}
          </LayoutWithConditionalSidebar>
        </div>
      </TenantProvider>
    </Providers>
  );
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;
  const tenant = await withDbRetry(() =>
    db.query.tenants.findFirst({
      where: eq(tenants.slug, tenantSlug),
    }),
  );

  return {
    title: tenant ? `${tenant.name} - AI Governance` : "Tenant Not Found",
    description: tenant?.description || "AI Governance Platform",
  };
}
