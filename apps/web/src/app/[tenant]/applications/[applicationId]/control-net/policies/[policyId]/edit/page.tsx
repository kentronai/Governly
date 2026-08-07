import { db } from "@/db"
import { PolicyEditClient } from "./page-client"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getPolicyDetails } from "@/lib/actions/policies"
import {
  getAvailableGuardrails,
  getResolvableGuardrails,
} from "@/lib/queries/guardrails"

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

  // Two different lists, deliberately:
  //   - `availableGuardrails` gates what can be ADDED (built-ins + installed).
  //   - `resolvableGuardrails` additionally covers what this policy already
  //     binds, so a policy holding an uninstalled marketplace guardrail still
  //     resolves on save instead of aborting and becoming uneditable.
  const [availableGuardrails, resolvableGuardrails] = await Promise.all([
    getAvailableGuardrails(tenant.id),
    getResolvableGuardrails(tenant.id, policyId),
  ])

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
        resolvableGuardrails={resolvableGuardrails}
      />
    </div>
  )
}
