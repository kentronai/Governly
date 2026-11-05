import {
  agentPolicyEvaluations,
  applicationPolicyCenter,
  applications,
  db,
  policyCenter,
} from "@db";
import { and, eq, isNull } from "drizzle-orm";
import { evaluateApplicationCompliancePolicy } from "@/lib/server/compliance/evaluation-engine";
import { syncTenantAgentPolicyEvaluations } from "./agent-policy-sync";

/**
 * Materialize an organization-level compliance policy across every current
 * application and agent. New assets call the same sync path when created or
 * discovered, which makes rollout deterministic instead of UI-dependent.
 */
export async function rolloutTenantCompliancePolicy(
  tenantId: string,
  rootPolicyId: string,
  isActive: boolean,
) {
  const tenantPolicy = await db.query.policyCenter.findFirst({
    where: and(
      eq(policyCenter.tenantId, tenantId),
      eq(policyCenter.parentPolicyId, rootPolicyId),
    ),
  });
  if (!tenantPolicy)
    throw new Error("Tenant compliance policy is not configured");

  if (!isActive) {
    await Promise.all([
      db
        .update(applicationPolicyCenter)
        .set({ isActive: false })
        .where(
          and(
            eq(applicationPolicyCenter.tenantId, tenantId),
            eq(applicationPolicyCenter.policyId, rootPolicyId),
          ),
        ),
      db
        .update(agentPolicyEvaluations)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(agentPolicyEvaluations.tenantId, tenantId),
            eq(agentPolicyEvaluations.policyType, "compliance"),
            eq(agentPolicyEvaluations.policyId, rootPolicyId),
          ),
        ),
    ]);
    return { applicationsEvaluated: 0, agentsEvaluated: 0 };
  }

  const appRows = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(eq(applications.tenantId, tenantId), isNull(applications.deletedAt)),
    );
  for (const application of appRows) {
    const evaluation = await evaluateApplicationCompliancePolicy({
      tenantId,
      applicationId: application.id,
      policy: {
        id: rootPolicyId,
        name: tenantPolicy.name,
        controlMappings: tenantPolicy.controlMappings,
        applicabilityRules: tenantPolicy.applicabilityRules,
      },
    });
    const existing = await db.query.applicationPolicyCenter.findFirst({
      where: and(
        eq(applicationPolicyCenter.tenantId, tenantId),
        eq(applicationPolicyCenter.applicationId, application.id),
        eq(applicationPolicyCenter.policyId, rootPolicyId),
      ),
    });
    const values = {
      tenantId,
      applicationId: application.id,
      policyId: rootPolicyId,
      isActive: true,
      applicabilityStatus: evaluation.applicabilityStatus,
      complianceStatus: evaluation.complianceStatus,
      coverageScore: evaluation.coverageScore.toFixed(2),
      evaluation,
      gaps: evaluation.gaps,
      evidence: evaluation.evidence,
      evaluatedAt: evaluation.evaluatedAt,
    };
    if (existing) {
      await db
        .update(applicationPolicyCenter)
        .set(values)
        .where(eq(applicationPolicyCenter.id, existing.id));
    } else {
      await db.insert(applicationPolicyCenter).values(values);
    }
  }
  const agentResult = await syncTenantAgentPolicyEvaluations(tenantId);
  return {
    applicationsEvaluated: appRows.length,
    agentsEvaluated: agentResult.agentsEvaluated,
  };
}

/** Apply every currently enabled tenant policy to one newly created app. */
export async function applyActiveCompliancePoliciesToApplication(
  tenantId: string,
  applicationId: string,
) {
  const active = await db.query.policyCenter.findMany({
    where: and(
      eq(policyCenter.tenantId, tenantId),
      eq(policyCenter.isActive, true),
    ),
  });
  for (const policy of active) {
    const rootPolicyId = policy.parentPolicyId ?? policy.id;
    const evaluation = await evaluateApplicationCompliancePolicy({
      tenantId,
      applicationId,
      policy: {
        id: rootPolicyId,
        name: policy.name,
        controlMappings: policy.controlMappings,
        applicabilityRules: policy.applicabilityRules,
      },
    });
    const existing = await db.query.applicationPolicyCenter.findFirst({
      where: and(
        eq(applicationPolicyCenter.tenantId, tenantId),
        eq(applicationPolicyCenter.applicationId, applicationId),
        eq(applicationPolicyCenter.policyId, rootPolicyId),
      ),
    });
    const values = {
      tenantId,
      applicationId,
      policyId: rootPolicyId,
      isActive: true,
      applicabilityStatus: evaluation.applicabilityStatus,
      complianceStatus: evaluation.complianceStatus,
      coverageScore: evaluation.coverageScore.toFixed(2),
      evaluation,
      gaps: evaluation.gaps,
      evidence: evaluation.evidence,
      evaluatedAt: evaluation.evaluatedAt,
    };
    if (existing)
      await db
        .update(applicationPolicyCenter)
        .set(values)
        .where(eq(applicationPolicyCenter.id, existing.id));
    else await db.insert(applicationPolicyCenter).values(values);
  }
  return { policiesApplied: active.length };
}
