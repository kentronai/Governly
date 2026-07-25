import { db, guardrails } from "@/db"
import { eq, and, isNull } from "drizzle-orm"
import { PolicyCreationClient } from "./page-client"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function NewPolicyPage({ params }: PageProps) {
  const { userId } = await auth()
  
  if (!userId) {
    redirect("/sign-in")
  }
  
  const { tenant: tenantSlug } = await params

  // Get tenant
  const tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.slug, tenantSlug),
  })

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  // Fetch tenant's available guardrails (including installed global ones)
  const availableGuardrails = await db.query.guardrails.findMany({
    where: and(
      eq(guardrails.tenantId, tenant.id),
      eq(guardrails.isEnabled, true),
      isNull(guardrails.deletedAt)
    ),
    orderBy: (guardrails, { asc }) => [asc(guardrails.tier), asc(guardrails.name)],
  })

  return (
    <div className="">
      <PolicyCreationClient
        tenantSlug={tenantSlug}
        userId={userId}
        availableGuardrails={availableGuardrails.map(g => ({
          // Project to exactly the shape PolicyCreationClient expects rather
          // than spreading the whole drizzle row (whose jsonb defaultParams is
          // typed `unknown` and whose extra columns don't match the prop type).
          id: g.id,
          key: g.key,
          name: g.name || g.key,
          tier: g.tier,
          description: g.description || "",
          defaultParams: (g.defaultParams ?? {}) as Record<string, unknown>,
        }))}
      />
    </div>
  )
}
