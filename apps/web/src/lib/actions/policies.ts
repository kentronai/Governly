/**
 * Server actions for Policies
 */

'use server';

import { db, policies, tenants, applicationPolicies, agents } from '@db';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { createAuditEvent } from '@/lib/server/audit';
import { getPolicyWithDetails } from '@/lib/queries/policies';
import { syncAgentPolicyEvaluations } from '@/lib/server/policy-enforcement/agent-policy-sync';

export interface UpdatePolicyInput {
  id: string;
  tenantSlug: string;
  [key: string]: any; // Allow any policy fields to be updated
}

export const getPolicyById = async (tenantSlug: string, id: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  const tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
  if (!tenantRow.length) throw new Error('Tenant not found');
  const tenantId = tenantRow[0].id;

  const policy = await db.query.policies.findFirst({
    where: and(
      eq(policies.id, id),
      eq(policies.tenantId, tenantId),
      isNull(policies.deletedAt)
    ),
  });

  if (!policy) throw new Error('Policy not found');

  return {
    id: policy.id,
    tenant_id: policy.tenantId,
    name: policy.name,
    version: policy.version,
    slug: policy.slug,
    description: policy.description,
    ai_system_policy_prompt: policy.aiSystemPolicyPrompt,
    composition_strategy: policy.compositionStrategy,
    yaml: policy.yaml,
    hash: policy.hash,
    status: policy.status,
    is_active: policy.isActive,
    metadata: policy.metadata,
    created_by: policy.createdBy,
    updated_by: policy.updatedBy,
    valid_from: policy.validFrom,
    valid_to: policy.validTo,
    created_at: policy.createdAt,
    updated_at: policy.updatedAt,
    deleted_at: policy.deletedAt,
    compiled: policy.compiled,
  };
};

export const updatePolicy = async (input: UpdatePolicyInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  const tenantRow = await db.select().from(tenants).where(eq(tenants.slug, input.tenantSlug)).limit(1);
  if (!tenantRow.length) throw new Error('Tenant not found');
  const tenantId = tenantRow[0].id;

  const existingPolicy = await db.query.policies.findFirst({
    where: and(
      eq(policies.id, input.id),
      eq(policies.tenantId, tenantId),
      isNull(policies.deletedAt)
    ),
  });

  if (!existingPolicy) throw new Error('Policy not found');

  const { id, tenantSlug, ...updateData } = input;

  const updatedPolicy = await db.update(policies)
    .set({
      ...updateData,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(
      eq(policies.id, id),
      eq(policies.tenantId, tenantId)
    ))
    .returning();

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: 'policy.updated',
      targetType: 'policy',
      targetId: id,
      metadata: { update: updateData },
    });
  } catch (e) {
    console.error('Failed to write audit event (policy.updated):', e);
  }

  return {
    success: true,
    data: updatedPolicy[0],
    message: 'Policy updated successfully',
  };
};

export const deletePolicy = async (tenantSlug: string, id: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  const tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
  if (!tenantRow.length) throw new Error('Tenant not found');
  const tenantId = tenantRow[0].id;

  const existingPolicy = await db.query.policies.findFirst({
    where: and(
      eq(policies.id, id),
      eq(policies.tenantId, tenantId),
      isNull(policies.deletedAt)
    ),
  });

  if (!existingPolicy) throw new Error('Policy not found');

  await db.delete(policies)
    .where(and(
      eq(policies.id, id),
      eq(policies.tenantId, tenantId)
    ));

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: 'policy.deleted',
      targetType: 'policy',
      targetId: id,
    });
  } catch (e) {
    console.error('Failed to write audit event (policy.deleted):', e);
  }

  return { success: true, message: 'Policy deleted successfully' };
};

// Get policy details with guardrails (from YAML and database)
export const getPolicyDetails = async (tenantSlug: string, policyId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  const tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
  if (!tenantRow.length) throw new Error('Tenant not found');
  const tenantId = tenantRow[0].id;

  // Use the query function which already handles YAML parsing and guardrail fetching
  const policy = await getPolicyWithDetails(policyId);

  // Verify policy belongs to tenant
  if (policy.tenantId !== tenantId) {
    throw new Error('Policy not found');
  }

  // Transform to match frontend interface
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    version: policy.version,
    status: policy.status,
    isActive: policy.isActive,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
    yaml: policy.yaml,
    composition: policy.composition,
    yamlGuardrails: policy.yamlGuardrails,
    databaseGuardrails: policy.databaseGuardrails,
    createdByUser: policy.user_createdBy,
    updatedByUser: policy.user_updatedBy,
  };
};

// Get all policies for a tenant
export const getTenantPolicies = async (tenantSlugOrId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  // Try to find tenant by ID first, then by slug
  let tenantRow = await db.select().from(tenants).where(eq(tenants.id, tenantSlugOrId)).limit(1);
  if (!tenantRow.length) {
    tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlugOrId)).limit(1);
  }
  if (!tenantRow.length) throw new Error('Tenant not found');
  const tenantId = tenantRow[0].id;

  // Get tenant-scoped policies (excluding deleted ones)
  const policiesList = await db.query.policies.findMany({
    where: and(
      eq(policies.tenantId, tenantId),
      isNull(policies.deletedAt)
    ),
    orderBy: (policies, { desc }) => [desc(policies.createdAt)],
  });

  // Transform policies to match frontend interface
  const transformedPolicies = policiesList.map(policy => {
    // Count rules from YAML if present
    let rulesCount = 0;
    if (policy.yaml) {
      const matches = policy.yaml.match(/- id:/g);
      rulesCount = matches ? matches.length : 0;
    }

    return {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      rulesCount: rulesCount || 0,
      yaml: policy.yaml,
      createdAt: policy.createdAt,
      version: policy.version,
      slug: policy.slug,
      status: policy.status,
      isActive: policy.isActive,
      createdBy: policy.createdBy,
      updatedBy: policy.updatedBy,
      updatedAt: policy.updatedAt,
    };
  });

  return {
    success: true,
    data: transformedPolicies,
  };
};

// Get policies for a specific application
export const getApplicationPolicies = async (tenantSlugOrId: string, applicationId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error('Authentication required');

  // Try to find tenant by ID first, then by slug
  let tenantRow = await db.select().from(tenants).where(eq(tenants.id, tenantSlugOrId)).limit(1);
  if (!tenantRow.length) {
    tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlugOrId)).limit(1);
  }
  if (!tenantRow.length) throw new Error('Tenant not found');
  const tenantId = tenantRow[0].id;

  // Get application policies
  const appPolicies = await db.query.applicationPolicies.findMany({
    where: and(
      eq(applicationPolicies.applicationId, applicationId),
      eq(applicationPolicies.tenantId, tenantId)
    ),
  });

  const policyIds = appPolicies.map((p) => p.policyId);
  if (policyIds.length === 0) {
    return {
      success: true,
      data: [],
      message: 'No policies linked to this application',
    };
  }

  const policiesList = await db.query.policies.findMany({
    where: and(
      eq(policies.tenantId, tenantId),
      isNull(policies.deletedAt),
      inArray(policies.id, policyIds)
    ),
    orderBy: (policies, { desc }) => [desc(policies.createdAt)],
  });

  // Hide the retired auto-seeded "Strict"/"Development" profiles. Only the
  // Launch policy is meant to be surfaced/edited going forward; existing rows
  // are left in the database untouched rather than deleted.
  const hiddenProfiles = new Set(["strict", "development"]);
  const visiblePoliciesList = policiesList.filter((policy) => {
    const metadata = policy.metadata as { defaultProfile?: string } | null;
    return !hiddenProfiles.has(metadata?.defaultProfile ?? "");
  });

  const transformedPolicies = visiblePoliciesList.map((policy) => {
    const rulesCount = policy.yaml?.match(/- id:/g)?.length || 0;
    const assignment = appPolicies.find((item) => item.policyId === policy.id);
    return {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      rulesCount,
      yaml: policy.yaml,
      createdAt: policy.createdAt,
      version: policy.version,
      slug: policy.slug,
      status: policy.status,
      isActive: policy.isActive,
      createdBy: policy.createdBy,
      updatedBy: policy.updatedBy,
      updatedAt: policy.updatedAt,
      isApplicationActive: assignment?.isActive ?? false,
      isDefault: assignment?.isDefault ?? false,
    };
  });

  return {
    success: true,
    data: transformedPolicies,
    tenantId,
    applicationId,
  };
};

/** Select the one runtime policy automatically enforced for an application. */
export const setApplicationDefaultPolicy = async (
  tenantSlugOrId: string,
  applicationId: string,
  policyId: string
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error('Authentication required');

  let tenantRow = await db.select().from(tenants).where(eq(tenants.id, tenantSlugOrId)).limit(1);
  if (!tenantRow.length) {
    tenantRow = await db.select().from(tenants).where(eq(tenants.slug, tenantSlugOrId)).limit(1);
  }
  if (!tenantRow.length || tenantRow[0].id !== orgId) throw new Error('Access denied');

  const assignment = await db.query.applicationPolicies.findFirst({
    where: and(
      eq(applicationPolicies.tenantId, orgId),
      eq(applicationPolicies.applicationId, applicationId),
      eq(applicationPolicies.policyId, policyId)
    ),
  });
  if (!assignment) throw new Error('Policy is not linked to this application');

  await db.transaction(async (tx) => {
    await tx.update(applicationPolicies).set({ isDefault: false }).where(and(
      eq(applicationPolicies.tenantId, orgId),
      eq(applicationPolicies.applicationId, applicationId)
    ));
    await tx.update(applicationPolicies).set({ isDefault: true, isActive: true }).where(
      eq(applicationPolicies.id, assignment.id)
    );
  });

  await createAuditEvent({
    tenantId: orgId,
    actorUserId: userId,
    action: 'runtime_policy.default_selected',
    targetType: 'policy',
    targetId: policyId,
    metadata: { applicationId },
  });
  const linkedAgents = await db.select({ id: agents.id }).from(agents).where(and(
    eq(agents.tenantId, orgId),
    eq(agents.applicationId, applicationId)
  ));
  for (const agent of linkedAgents) {
    await syncAgentPolicyEvaluations(orgId, agent.id);
  }
  revalidatePath(`/${tenantRow[0].slug}/applications/${applicationId}/control-net/policies`);
  return { success: true, agentsEvaluated: linkedAgents.length };
};
