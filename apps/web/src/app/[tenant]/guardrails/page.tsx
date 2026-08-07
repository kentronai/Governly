import { db, guardrails } from "@/db";
import { eq, and, isNull, inArray, notInArray, or } from "drizzle-orm";
import { BUILTIN_GUARDRAIL_KEYS } from "@/lib/builtin-guardrails";
import { GuardrailsPageClient } from "./page-client";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function GuardrailsPage({ params }: PageProps) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const { tenant: tenantSlug } = await params;

  // Get tenant
  const tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.slug, tenantSlug),
  });

  if (!tenant) {
    return <div>Tenant not found</div>;
  }

  // Fetch tenant's guardrails
  const installeduardrails = (
    await db.query.guardrails.findMany({
      where: and(
        eq(guardrails.tenantId, tenant.id),
        isNull(guardrails.deletedAt)
      ),

      orderBy: (g, { desc }) => [desc(g.createdAt)],
    })
  ).map((ele) => ele.fallbackGuardrailId || "");

  // The tenant's own guardrails: what it installed from the marketplace, plus the
  // built-ins NORIX ships. Built-ins belong here rather than in the marketplace —
  // every tenant already has them and there is nothing to install.
  const builtinKeys = [...BUILTIN_GUARDRAIL_KEYS];
  const tenantGuardrails = await db.query.guardrails.findMany({
    where: and(
      or(
        installeduardrails.length > 0
          ? inArray(guardrails.id, installeduardrails)
          : undefined,
        and(isNull(guardrails.tenantId), inArray(guardrails.key, builtinKeys))
      ),
      eq(guardrails.isEnabled, true),
      isNull(guardrails.deletedAt)
    ),

    orderBy: (g, { desc }) => [desc(g.createdAt)],
  });

  // Marketplace lists only installable products, so the built-ins are excluded.
  const marketplaceGuardrails = await db.query.guardrails.findMany({
    where: and(
      eq(guardrails.isGlobal, true),
      eq(guardrails.isEnabled, true),
      notInArray(guardrails.key, builtinKeys),
      isNull(guardrails.deletedAt)
    ),
    orderBy: (g, { desc }) => [desc(g.isCertified), desc(g.createdAt)],
  });

  return (
    <div className="">
      <GuardrailsPageClient
        tenantSlug={tenantSlug}
        userId={userId}
        tenantGuardrails={tenantGuardrails}
        marketplaceGuardrails={marketplaceGuardrails}
      />
    </div>
  );
}
