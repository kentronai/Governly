import { db } from "@/db"
import { PolicyEditClient } from "./page-client"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getPolicyDetails } from "@/lib/actions/policies"
import { getAvailableGuardrails } from "@/lib/queries/guardrails"

interface PageProps {
  params: Promise<{
    tenant: string
    applicationId: string
    policyId: string
  }>
}

export default async function EditPolicyPage({ params }: PageProps) {
  const { userId } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const { tenant: tenantSlug, applicationId, policyId } = await params

  // Get tenant
  const tenant = await db.query.tenants.findFirst({
    where: (tenants, { eq }) => eq(tenants.slug, tenantSlug),
  })

  if (!tenant) {
    return <div>Tenant not found</div>
  }

  // Fetch policy details
  let policyDetails
  try {
    policyDetails = await getPolicyDetails(tenantSlug, policyId)
  } catch (error) {
    return <div>Policy not found</div>
  }

  // Includes global catalog guardrails, which every default policy is built
  // from. handleSave resolves the saved composition against this list, so a
  // missing entry here silently drops that guardrail from the policy.
  const availableGuardrails = await getAvailableGuardrails(tenant.id)

  return (
    <div className="">
      <PolicyEditClient
        tenantSlug={tenantSlug}
        userId={userId}
        applicationId={applicationId}
        policyId={policyId}
        policyDetails={{
          ...policyDetails,
          description: policyDetails.description || "",
        }}
        availableGuardrails={availableGuardrails}
      />
    </div>
  )
}
