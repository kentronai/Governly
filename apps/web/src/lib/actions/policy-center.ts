/**
 * Server actions for Policy Center
 */

"use server";

import { db, policyCenter, applicationPolicyCenter } from "@db";
import { eq, and, isNull, ilike, notInArray, or } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { rolloutTenantCompliancePolicy } from "@/lib/server/policy-enforcement/compliance-rollout";

export interface GetPolicyCenterPoliciesOptions {
  category?: string;
  country?: string;
  state?: string;
  active?: string;
  search?: string;
  type?: string;
}

// Voluntary standards and guidance that live under Admin Center → Frameworks, so they are
// hidden from the Regulations library (rows stay for existing tenant mappings).
const FRAMEWORK_ONLY_POLICIES = [
  "ISO/IEC 42001",
  "ISO/IEC 27001",
  "NIST AI Risk Management Framework",
  "AI Ethics & Governance Framework",
  "ISO/IEC 23894",
  "OECD AI Principles",
  "UNESCO Recommendation on the Ethics of Artificial Intelligence",
  "EEOC Technical Assistance on ADA and AI",
  "FTC AI Guidance",
  "UK AI White Paper",
  "Australian AI Ethics Principles",
  "AI Verify Framework",
  "Assessment List for Trustworthy AI",
  "PCI DSS Lite",
];

/**
 * Get policy center policies with filters
 */
export const getPolicyCenterPoliciesAction = async (
  options?: GetPolicyCenterPoliciesOptions,
) => {
  const { orgId } = await auth();
  if (!orgId || orgId === null) {
    throw new Error("Authentication Failed");
  }

  const { category, country, state, active, search, type } = options || {};
  const filters = [
    isNull(policyCenter.parentPolicyId),
    isNull(policyCenter.tenantId),
    notInArray(policyCenter.name, FRAMEWORK_ONLY_POLICIES),
  ];
  if (category) filters.push(eq(policyCenter.category, category));
  if (country) filters.push(eq(policyCenter.country, country));
  if (type) filters.push(eq(policyCenter.type, type));
  if (state === "federal") filters.push(isNull(policyCenter.state));
  else if (state) filters.push(eq(policyCenter.state, state));
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    filters.push(
      or(
        ilike(policyCenter.name, term),
        ilike(policyCenter.description, term),
        ilike(policyCenter.country, term),
        ilike(policyCenter.governingAuthority, term),
      )!,
    );
  }

  const policies = await db.query.policyCenter.findMany({
    where: and(...filters),
    orderBy: (rows, { asc }) => [asc(rows.country), asc(rows.name)],
  });

  const orgActivePolicies = (
    await db.query.policyCenter.findMany({
      where: and(
        eq(policyCenter.tenantId, orgId),
        eq(policyCenter.isActive, true),
      ),
    })
  ).map((ele) => ele.parentPolicyId) as string[];

  let data = policies.map((ele) => {
    return {
      ...ele,
      isActive: orgActivePolicies.includes(ele.id),
    };
  });

  if (active === "enabled") data = data.filter((policy) => policy.isActive);
  if (active === "disabled") data = data.filter((policy) => !policy.isActive);

  return {
    success: true,
    data,
  };
};

/**
 * Create a new policy center policy
 */
export const createPolicyCenterPolicy = async (input: {
  name: string;
  description: string;
  category: string;
  country: string;
  state?: string;
  projectsCompliant?: number;
  totalProjects?: number;
  tags?: string[];
  icon?: string;
  color?: string;
  type?: string;
  disable?: boolean;
}) => {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authentication required");
  }

  try {
    const newPolicy = await db
      .insert(policyCenter)
      .values({
        name: input.name,
        description: input.description,
        category: input.category,
        country: input.country,
        state: input.state,
        projectsCompliant: input.projectsCompliant || 0,
        totalProjects: input.totalProjects || 0,
        tags: input.tags || [],
        icon: input.icon,
        color: input.color,
        type: input.type,
        disable: input.disable || false,
      })
      .returning();

    return {
      success: true,
      data: newPolicy[0],
    };
  } catch (error) {
    console.error("Error creating policy center policy:", error);
    throw new Error("Failed to create policy center policy");
  }
};

/**
 * Get a specific policy center policy by ID
 */
export const getPolicyCenterPolicyById = async (id: string) => {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Authentication required");
  }

  try {
    const policy = await db
      .select()
      .from(policyCenter)
      .where(eq(policyCenter.id, id))
      .limit(1);

    if (policy.length === 0) {
      throw new Error("Policy not found");
    }

    return {
      success: true,
      data: policy[0],
    };
  } catch (error) {
    console.error("Error fetching policy center policy:", error);
    throw error;
  }
};

/**
 * Update policy center policy active status
 */
export const updatePolicyCenterPolicyStatus = async (
  id: string,
  isActive: boolean,
) => {
  const { orgId } = await auth();
  if (!orgId || orgId === null) {
    throw new Error("Authentication Failed");
  }

  try {
    const verify = await db.query.policyCenter.findFirst({
      where: and(eq(policyCenter.id, id), eq(policyCenter.disable, false)),
    });

    if (!verify) {
      throw new Error("Policy is either doesn't exist or is disabled");
    }

    let exist = await db.query.policyCenter.findFirst({
      where: and(
        eq(policyCenter.parentPolicyId, id),
        eq(policyCenter.tenantId, orgId),
      ),
    });

    if (!exist) {
      const [newPolicy] = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(policyCenter)
          .values({
            name: verify.name,
            description: verify.description,
            category: verify.category,
            country: verify.country,
            state: verify.state,
            projectsCompliant: verify.projectsCompliant,
            totalProjects: verify.totalProjects,
            tags: verify.tags,
            icon: verify.icon,
            color: verify.color,
            type: verify.type,
            fullDescription: verify.fullDescription,
            purpose: verify.purpose,
            scope: verify.scope,
            requirements: verify.requirements,
            riskCategories: verify.riskCategories,
            industriesAffected: verify.industriesAffected,
            governingAuthority: verify.governingAuthority,
            effectiveDate: verify.effectiveDate,
            version: verify.version,
            legalStatus: verify.legalStatus,
            officialUrl: verify.officialUrl,
            references: verify.references,
            controlMappings: verify.controlMappings,
            applicabilityRules: verify.applicabilityRules,
            disable: verify.disable,
            metadata: verify.metadata,
            parentPolicyId: verify.id,
            tenantId: orgId,
            isActive,
          })
          .returning();
        if (!isActive) {
          await tx
            .update(applicationPolicyCenter)
            .set({ isActive: false })
            .where(
              and(
                eq(applicationPolicyCenter.tenantId, orgId),
                eq(applicationPolicyCenter.policyId, id),
              ),
            );
        }
        return [created];
      });
      exist = newPolicy;
    } else {
      exist = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(policyCenter)
          .set({ isActive })
          .where(eq(policyCenter.id, exist!.id))
          .returning();
        if (!isActive) {
          await tx
            .update(applicationPolicyCenter)
            .set({ isActive: false })
            .where(
              and(
                eq(applicationPolicyCenter.tenantId, orgId),
                eq(applicationPolicyCenter.policyId, id),
              ),
            );
        }
        return updated;
      });
    }

    // Evaluating every application and agent is the slow part (seconds to minutes
    // on a big tenant). The policy is already on/off, so answer now and finish the
    // rollout after the response instead of making the toggle (and the sidebar tab) wait.
    after(() =>
      rolloutTenantCompliancePolicy(orgId, id, isActive).catch((error) =>
        console.error("[POLICY ROLLOUT] failed", { orgId, policyId: id, error }),
      ),
    );
    revalidatePath("/[tenant]/admin/settings/policy-center", "page");

    return {
      policy: exist,
      success: true,
      message: `Status updated for policy ${id}`,
    };
  } catch (error) {
    console.error("Error updating policy center policy:", error);
    throw error;
  }
};

/**
 * Get active policies for organization
 */
export const getActivePolicies = async () => {
  const { orgId } = await auth();

  if (!orgId || orgId === null) {
    throw new Error("Authentication Failed");
  }

  try {
    const orgActivePolicies = await db.query.policyCenter.findMany({
      where: and(
        eq(policyCenter.tenantId, orgId),
        eq(policyCenter.isActive, true),
      ),
    });

    return {
      success: true,
      active: orgActivePolicies,
    };
  } catch (error) {
    console.error("[ACTIVE POLICY] Error:", error);
    throw new Error("Failed to fetch active policies");
  }
};
