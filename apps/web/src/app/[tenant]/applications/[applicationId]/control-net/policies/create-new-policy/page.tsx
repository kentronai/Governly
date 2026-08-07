import { db } from "@/db"
import { PolicyCreationClient } from "./page-client"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getAvailableGuardrails } from "@/lib/queries/guardrails"

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

  // Includes global catalog guardrails; without them the composition builder
  // renders an empty picker that misleadingly reads "All guardrails have been
  // added".
  const availableGuardrails = await getAvailableGuardrails(tenant.id)

  return (
    <div className="">
      <PolicyCreationClient
        tenantSlug={tenantSlug}
        userId={userId}
        availableGuardrails={availableGuardrails}
      />
    </div>
  )
}
