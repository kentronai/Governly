/**
 * Server actions for Risks
 * Used for mutations from client components
 */

"use server";

import { db, risks, tenants, applications, riskList, useCases } from "@db";
import { eq, and, isNull, or, arrayContains, inArray } from "drizzle-orm";
import { FRAMEWORK_SLUGS } from "@/lib/frameworks";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { withApplicationTracking } from "@/lib/utils/application-tracking";
import { createAuditEvent } from "@/lib/server/audit";
import { calculateRiskLevel } from "@/lib/risk-level";

interface CreateRiskInput {
  tenantId: string;
  applicationId: string;
  useCaseId?: string;
  riskName: string;
  description?: string;
  owner: string;
  severity: "Minor" | "Moderate" | "Major" | "Catastrophic";
  likelihood: "Rare" | "Unlikely" | "Possible" | "Likely";
  /** Ignored: always derived from severity x likelihood (lib/risk-level). */
  riskLevel?: "Low" | "Medium" | "High" | "Critical";
  mitigationStatus?:
    | "Not Started"
    | "In Progress"
    | "Requires Review"
    | "Completed";
  mitigationPlan?: string;
  targetDate?: string;
  lastReviewDate?: string;
  categories?: string[];
  metadata?: Record<string, any>;
  useCaseIds?: string[];
  frameworkSlugs?: string[];
  lifecyclePhase?: string | null;
  potentialImpact?: string | null;
  reviewNotes?: string | null;
  implementationStrategy?: string | null;
  residualSeverity?: "Minor" | "Moderate" | "Major" | "Catastrophic" | null;
  residualLikelihood?: "Rare" | "Unlikely" | "Possible" | "Likely" | null;
  /** Ignored: always derived from residual severity x likelihood. */
  residualLevel?: "Low" | "Medium" | "High" | "Critical" | null;
}

interface UpdateRiskInput extends Partial<CreateRiskInput> {
  id: string;
}

/**
 * Keep only references the user may make: use cases of this tenant's application, and
 * regulation/framework slugs that exist. A graph built from these links can then trust them.
 */
async function cleanLinks(
  tenantId: string,
  applicationId: string,
  input: { useCaseIds?: string[]; frameworkSlugs?: string[] },
) {
  const out: { useCaseIds?: string[]; frameworkSlugs?: string[] } = {};
  if (input.useCaseIds) {
    out.useCaseIds = input.useCaseIds.length
      ? (
          await db
            .select({ id: useCases.id })
            .from(useCases)
            .where(
              and(
                inArray(useCases.id, input.useCaseIds),
                eq(useCases.tenantId, tenantId),
                eq(useCases.applicationId, applicationId),
              ),
            )
        ).map((r) => r.id)
      : [];
  }
  if (input.frameworkSlugs)
    out.frameworkSlugs = input.frameworkSlugs.filter((s) => FRAMEWORK_SLUGS.includes(s));
  return out;
}

/** The signed-in user must belong to the risk's organisation. */
async function assertTenant(tenantId: string) {
  const { userId, orgId } = await auth();
  if (!userId) throw new Error("Authentication required");
  if (orgId !== tenantId) throw new Error("Tenant access denied");
  return userId;
}

// Create risk
export const createRisk = async (input: CreateRiskInput) => {
  return withApplicationTracking(input.applicationId, async () => {
    const { userId, orgId } = await auth();

    if (!userId) {
      throw new Error("Authentication required");
    }
    if (orgId !== input.tenantId) {
      throw new Error("Tenant access denied");
    }

    const [risk] = await db
      .insert(risks)
      .values({
        ...input,
        ...(await cleanLinks(input.tenantId, input.applicationId, input)),
        riskLevel: calculateRiskLevel(input.severity, input.likelihood)!,
        residualLevel:
          calculateRiskLevel(input.residualSeverity, input.residualLikelihood) ?? null,
        mitigationStatus: input.mitigationStatus || "Not Started",
        categories: input.categories || [],
        metadata: input.metadata || {},
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    revalidatePath(`/applications/${input.applicationId}`);

    console.log("risk", risk);
    try {
      console.log("creating audit event");
      await createAuditEvent({
        tenantId: input.tenantId,
        actorUserId: userId,
        action: "risk.created",
        targetType: "risk",
        targetId: risk.id,
        metadata: { applicationId: input.applicationId, name: input.riskName },
      });
    } catch (e) {
      console.error("Failed to write audit event (risk.created):", e);
    }

    return risk;
  });
};

// Update risk
export const updateRisk = async (input: UpdateRiskInput) => {
  // Get the risk first to get the applicationId
  const existingRisk = await db.query.risks.findFirst({
    where: eq(risks.id, input.id),
  });

  if (!existingRisk) {
    throw new Error("Risk not found");
  }

  return withApplicationTracking(existingRisk.applicationId, async () => {
    const userId = await assertTenant(existingRisk.tenantId);

    const { id, tenantId: _t, applicationId: _a, ...rest } = input;
    const updateData = {
      ...rest,
      ...(await cleanLinks(existingRisk.tenantId, existingRisk.applicationId, rest)),
    };
    const level = calculateRiskLevel(
      updateData.severity ?? existingRisk.severity,
      updateData.likelihood ?? existingRisk.likelihood,
    );
    if (level) updateData.riskLevel = level;
    updateData.residualLevel =
      calculateRiskLevel(
        "residualSeverity" in updateData ? updateData.residualSeverity : existingRisk.residualSeverity,
        "residualLikelihood" in updateData ? updateData.residualLikelihood : existingRisk.residualLikelihood,
      ) ?? null;

    const [risk] = await db
      .update(risks)
      .set({
        ...updateData,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(risks.id, id))
      .returning();

    if (!risk) {
      throw new Error("Risk not found");
    }

    revalidatePath(`/applications/${risk.applicationId}`);

    try {
      await createAuditEvent({
        tenantId: existingRisk.tenantId,
        actorUserId: userId,
        action: "risk.updated",
        targetType: "risk",
        targetId: risk.id,
        metadata: { update: updateData },
      });
    } catch (e) {
      console.error("Failed to write audit event (risk.updated):", e);
    }

    return risk;
  });
};

// Delete risk (hard delete)
export const deleteRisk = async (id: string) => {
  // Get the risk first to get the applicationId
  const existingRisk = await db.query.risks.findFirst({
    where: eq(risks.id, id),
  });

  if (!existingRisk) {
    throw new Error("Risk not found");
  }

  return withApplicationTracking(existingRisk.applicationId, async () => {
    const userId = await assertTenant(existingRisk.tenantId);

    await db.delete(risks).where(eq(risks.id, id));

    revalidatePath(`/applications/${existingRisk.applicationId}`);

    try {
      await createAuditEvent({
        tenantId: existingRisk.tenantId,
        actorUserId: userId,
        action: "risk.deleted",
        targetType: "risk",
        targetId: id,
      });
    } catch (e) {
      console.error("Failed to write audit event (risk.deleted):", e);
    }

    return { success: true };
  });
};

// Get all risks by use case ID
export const getRisksByUseCase = async (useCaseId: string) => {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Authentication required");
  }

  const risksData = await db.query.risks.findMany({
    where: eq(risks.useCaseId, useCaseId),
    with: {
      useCase: true,
      user_createdBy: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      user_updatedBy: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: (risks, { desc }) => [desc(risks.createdAt)],
  });

  return risksData;
};

// Get risk by use case ID (deprecated - kept for backward compatibility, returns first risk)
export const getRiskByUseCase = async (useCaseId: string) => {
  const risks = await getRisksByUseCase(useCaseId);
  return risks[0] || null;
};

// Get all risks for an application, optionally filtered by use case
export const getRisksByApplication = async (
  tenantSlugOrId: string,
  applicationId: string,
  useCaseId?: string,
) => {
  const { userId } = await auth();

  if (!userId) {
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

  // Verify application exists and belongs to tenant
  const application = await db.query.applications.findFirst({
    where: and(
      eq(applications.id, applicationId),
      eq(applications.tenantId, tenantId),
      isNull(applications.deletedAt),
    ),
  });

  if (!application) {
    throw new Error("Application not found");
  }

  // Build where conditions
  const conditions = [eq(risks.applicationId, applicationId)];

  // If useCaseId is provided, filter by it as well
  if (useCaseId) {
    conditions.push(
      or(eq(risks.useCaseId, useCaseId), arrayContains(risks.useCaseIds, [useCaseId]))!,
    );
  }

  // Get risks for the application (and optionally filtered by use case)
  const risksData = await db.query.risks.findMany({
    where: and(...conditions),
    with: {
      useCase: true,
      user_createdBy: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      user_updatedBy: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: (risks, { desc }) => [desc(risks.createdAt)],
  });

  return risksData;
};

// Get risk list items (templates from database)
export const getRiskListItems = async () => {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Authentication required");
  }

  const riskListItems = await db
    .select()
    .from(riskList)
    .orderBy(riskList.riskName);

  return riskListItems;
};
