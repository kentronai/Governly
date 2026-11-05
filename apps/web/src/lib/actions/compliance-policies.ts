/**
 * Server actions for Compliance Policies (Application-level Policy Center)
 */

"use server";

import { db, applicationPolicyCenter, policyCenter, tenants } from "@db";
import { eq, and } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAuditEvent } from "@/lib/server/audit";
import { evaluateApplicationCompliancePolicy } from "@/lib/server/compliance/evaluation-engine";

/**
 * Get compliance policies for an application
 */
const ADMIN_ORG_ROLES = ["org:admin", "admin", "org:owner"];

export const getApplicationCompliancePolicies = async (
  tenantSlugOrId: string,
  applicationId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  // Try to find tenant by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const tenantId = tenantRow[0].id;

  // Verify tenant matches orgId
  if (tenantId !== orgId) {
    throw new Error("Access denied");
  }

  try {
    const orgActivePolicies = await db.query.policyCenter.findMany({
      where: and(
        eq(policyCenter.tenantId, orgId),
        eq(policyCenter.isActive, true),
      ),
    });

    let applicationActivepolicies =
      await db.query.applicationPolicyCenter.findMany({
        where: and(
          eq(applicationPolicyCenter.applicationId, applicationId),
          eq(applicationPolicyCenter.tenantId, orgId),
        ),
      });

    // Recalculate enabled assignments whenever an application dashboard asks
    // for them. This makes newly-added documentation, ownership, tests and
    // ControlNet detections visible without a scheduled mock refresh.
    const refreshedAssignments = await Promise.all(
      applicationActivepolicies.map(async (assignment) => {
        if (!assignment.isActive) return assignment;
        const definition = orgActivePolicies.find(
          (entry) => entry.parentPolicyId === assignment.policyId,
        );
        if (!definition) return assignment;
        try {
          const evaluation = await evaluateApplicationCompliancePolicy({
            tenantId: orgId,
            applicationId,
            policy: {
              id: assignment.policyId ?? definition.id,
              name: definition.name,
              controlMappings: definition.controlMappings,
              applicabilityRules: definition.applicabilityRules,
            },
          });
          const [updated] = await db
            .update(applicationPolicyCenter)
            .set({
              applicabilityStatus: evaluation.applicabilityStatus,
              complianceStatus: evaluation.complianceStatus,
              coverageScore: evaluation.coverageScore.toFixed(2),
              evaluation,
              gaps: evaluation.gaps,
              evidence: evaluation.evidence,
              evaluatedAt: evaluation.evaluatedAt,
            })
            .where(eq(applicationPolicyCenter.id, assignment.id))
            .returning();
          return updated;
        } catch (error) {
          console.error(
            `Automatic compliance evaluation failed for ${assignment.policyId}:`,
            error,
          );
          return assignment;
        }
      }),
    );
    applicationActivepolicies = refreshedAssignments;

    const policies = orgActivePolicies.map((policy) => {
      const assignment = applicationActivepolicies.find(
        (entry) => entry.policyId === policy.parentPolicyId,
      );
      return {
        ...policy,
        isActive: assignment?.isActive ?? false,
        applicabilityStatus: assignment?.applicabilityStatus ?? "not_evaluated",
        complianceStatus: assignment?.complianceStatus ?? "not_evaluated",
        coverageScore: Number(assignment?.coverageScore ?? 0),
        evaluation: assignment?.evaluation ?? {},
        gaps: assignment?.gaps ?? [],
        evidence: assignment?.evidence ?? [],
        evaluatedAt: assignment?.evaluatedAt ?? null,
      };
    });

    return {
      success: true,
      policies,
      message: `Policies Status for application ${applicationId}`,
    };
  } catch (error) {
    console.error("Error getting compliance policies:", error);
    throw new Error(`Failed to get policies for application ${applicationId}`);
  }
};

/**
 * Update compliance policy status for an application
 */
export const updateApplicationCompliancePolicy = async (
  tenantSlugOrId: string,
  applicationId: string,
  policyId: string,
  isActive: boolean,
) => {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) {
    return { success: false as const, error: "Authentication required" };
  }

  // Try to find tenant by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length)
    return { success: false as const, error: "Tenant not found" };
  const tenantId = tenantRow[0].id;

  // Verify tenant matches orgId
  if (tenantId !== orgId) {
    return { success: false as const, error: "Access denied" };
  }

  try {
    // Verify policy exists and is enabled by platform
    const verify = await db.query.policyCenter.findFirst({
      where: and(
        eq(policyCenter.id, policyId),
        eq(policyCenter.disable, false),
      ),
    });

    if (!verify) {
      throw new Error("Policy is either doesn't exist or is disabled");
    }

    // Check if the organisation admin has enabled it
    const isEnabled = await db.query.policyCenter.findFirst({
      where: and(
        eq(policyCenter.parentPolicyId, policyId),
        eq(policyCenter.tenantId, orgId),
      ),
    });

    if (!isEnabled) {
      throw new Error("Policy is not enabled by admin");
    }
    // Organization-enabled policies apply to every application; only an
    // organization admin may opt a single application out.
    if (
      !isActive &&
      isEnabled.isActive &&
      !ADMIN_ORG_ROLES.includes(orgRole ?? "")
    ) {
      return {
        success: false as const,
        error:
          "Only organization admins can turn off this policy for an application. Ask an admin to do it.",
      };
    }

    const evaluation = isActive
      ? await evaluateApplicationCompliancePolicy({
          tenantId: orgId,
          applicationId,
          policy: {
            id: verify.id,
            name: verify.name,
            controlMappings: verify.controlMappings,
            applicabilityRules: verify.applicabilityRules,
          },
        })
      : null;

    let exist = await db.query.applicationPolicyCenter.findFirst({
      where: and(
        eq(applicationPolicyCenter.applicationId, applicationId),
        eq(applicationPolicyCenter.policyId, policyId),
        eq(applicationPolicyCenter.tenantId, orgId),
      ),
    });

    if (!exist) {
      const [newPolicy] = await db
        .insert(applicationPolicyCenter)
        .values({
          applicationId,
          policyId,
          tenantId: orgId,
          isActive,
          ...(evaluation && {
            applicabilityStatus: evaluation.applicabilityStatus,
            complianceStatus: evaluation.complianceStatus,
            coverageScore: evaluation.coverageScore.toFixed(2),
            evaluation,
            gaps: evaluation.gaps,
            evidence: evaluation.evidence,
            evaluatedAt: evaluation.evaluatedAt,
          }),
        })
        .returning();

      exist = newPolicy;
    } else {
      const [updated] = await db
        .update(applicationPolicyCenter)
        .set({
          isActive,
          ...(evaluation && {
            applicabilityStatus: evaluation.applicabilityStatus,
            complianceStatus: evaluation.complianceStatus,
            coverageScore: evaluation.coverageScore.toFixed(2),
            evaluation,
            gaps: evaluation.gaps,
            evidence: evaluation.evidence,
            evaluatedAt: evaluation.evaluatedAt,
          }),
        })
        .where(
          and(
            eq(applicationPolicyCenter.applicationId, applicationId),
            eq(applicationPolicyCenter.policyId, policyId),
            eq(applicationPolicyCenter.tenantId, orgId),
          ),
        )
        .returning();

      exist = updated;
    }

    try {
      await createAuditEvent({
        tenantId: orgId,
        actorUserId: userId,
        action: "compliance_policy.updated",
        targetType: "compliance_policy",
        targetId: policyId,
        metadata: {
          applicationId,
          isActive,
          complianceStatus: evaluation?.complianceStatus,
          coverageScore: evaluation?.coverageScore,
          evaluatedAt: evaluation?.evaluatedAt,
        },
      });
    } catch (e) {
      console.error(
        "Failed to write audit event (compliance_policy.updated):",
        e,
      );
    }

    revalidatePath(`/${tenantRow[0].slug}/applications/${applicationId}`);

    return {
      success: true as const,
      message: `Status updated for policy ${policyId}`,
      evaluation,
    };
  } catch (error) {
    console.error("Error updating compliance policy:", error);
    // Returned, not thrown: production builds strip thrown server-action messages.
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update policy status",
    };
  }
};

/** Re-run an enabled policy after documentation, risks, tests or traffic change. */
export const evaluateApplicationCompliancePolicyAction = async (
  tenantSlugOrId: string,
  applicationId: string,
  policyId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length || tenantRow[0].id !== orgId)
    throw new Error("Access denied");

  const [definition, assignment] = await Promise.all([
    db.query.policyCenter.findFirst({
      where: and(
        eq(policyCenter.id, policyId),
        eq(policyCenter.disable, false),
      ),
    }),
    db.query.applicationPolicyCenter.findFirst({
      where: and(
        eq(applicationPolicyCenter.applicationId, applicationId),
        eq(applicationPolicyCenter.policyId, policyId),
        eq(applicationPolicyCenter.tenantId, orgId),
        eq(applicationPolicyCenter.isActive, true),
      ),
    }),
  ]);
  if (!definition) throw new Error("Compliance policy not found");
  if (!assignment) throw new Error("Enable this policy before evaluating it");

  const evaluation = await evaluateApplicationCompliancePolicy({
    tenantId: orgId,
    applicationId,
    policy: {
      id: definition.id,
      name: definition.name,
      controlMappings: definition.controlMappings,
      applicabilityRules: definition.applicabilityRules,
    },
  });

  await db
    .update(applicationPolicyCenter)
    .set({
      applicabilityStatus: evaluation.applicabilityStatus,
      complianceStatus: evaluation.complianceStatus,
      coverageScore: evaluation.coverageScore.toFixed(2),
      evaluation,
      gaps: evaluation.gaps,
      evidence: evaluation.evidence,
      evaluatedAt: evaluation.evaluatedAt,
    })
    .where(eq(applicationPolicyCenter.id, assignment.id));

  await createAuditEvent({
    tenantId: orgId,
    actorUserId: userId,
    action: "compliance_policy.evaluated",
    targetType: "compliance_policy",
    targetId: policyId,
    metadata: {
      applicationId,
      complianceStatus: evaluation.complianceStatus,
      coverageScore: evaluation.coverageScore,
      gaps: evaluation.gaps.map((gap) => gap.key),
    },
  });
  revalidatePath(`/${tenantRow[0].slug}/applications/${applicationId}`);
  return { success: true, evaluation };
};
