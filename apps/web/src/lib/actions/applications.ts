/**
 * Server actions for Applications
 * Used for mutations from client components
 */

"use server";

import {
  db,
  applications,
  memberships,
  stakeholders,
  users,
  tenants,
  policies,
  applicationPolicies,
  guardrails,
  policyGuardrails,
} from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import {
  requireActiveTenant,
  requireTenantMember,
} from "@/lib/server/tenant-access";
import {
  DEFAULT_APPLICATION_POLICIES,
  DEFAULT_APPLICATION_POLICY_VERSION,
  buildDefaultPolicyYaml,
} from "@/lib/default-application-policies";
import { eq, and, sql, isNull, or, ilike, inArray } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import {
  fetchClerkIdentity,
  PLACEHOLDER_EMAIL_SUFFIX,
} from "@/lib/server/user-identity";
import { revalidatePath } from "next/cache";
import {
  getApplicationsWithSummary,
  getArchivedApplications,
} from "@/lib/queries/applications";
import { applyActiveCompliancePoliciesToApplication } from "@/lib/server/policy-enforcement/compliance-rollout";

interface CreateApplicationInput {
  tenantId: string;
  name: string;
  description?: string;
  goviqEnabled: boolean;
  controlnetEnabled: boolean;
}

interface UpdateApplicationInput {
  id: string;
  name?: string;
  description?: string;
  status?: "Not Started" | "In Progress" | "Completed" | "Archived";
  goviqEnabled?: boolean;
  controlnetEnabled?: boolean;
  metadata?: any;
}

// Create application
export const createApplication = async (input: CreateApplicationInput) => {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new Error("Authentication required");
  }

  if (!orgId || input.tenantId !== orgId) {
    throw new Error("Tenant mismatch");
  }

  const goviqEnabled = true;

  const { application, tenantSlug } = await db.transaction(async (tx) => {
    const tenant = await tx.query.tenants.findFirst({
      where: eq(tenants.id, input.tenantId),
      columns: { slug: true },
    });

    if (!tenant) {
      throw new Error("Tenant not found");
    }

    let user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        name: true,
        email: true,
      },
    });

    if (!user) {
      // The local users row can be missing when the Clerk user webhook has not
      // synced yet (or never fired). Resolve the real identity straight from
      // Clerk instead of persisting an "Unknown user" placeholder that then
      // surfaces as the owner / last-updated-by / stakeholder on the overview.
      const identity = await fetchClerkIdentity(userId);
      const clerkName = identity?.name ?? null;
      const clerkEmail =
        identity?.email || `${userId}${PLACEHOLDER_EMAIL_SUFFIX}`;

      const [syncedUser] = await tx
        .insert(users)
        .values({
          id: userId,
          email: clerkEmail,
          name: clerkName,
          imageUrl: identity?.imageUrl ?? null,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: clerkEmail || users.email,
            name: clerkName || users.name,
            imageUrl: identity?.imageUrl || users.imageUrl,
            updatedAt: new Date().toISOString(),
          },
        })
        .returning({
          name: users.name,
          email: users.email,
        });

      user = syncedUser;
    }

    if (!user) {
      throw new Error(`Unable to sync user with ID ${userId}.`);
    }

    await tx
      .insert(memberships)
      .values({
        tenantId: input.tenantId,
        userId,
        role: orgRole || "org:member",
        permissions: orgRole === "org:admin" ? ["*"] : [""],
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: {
          role: orgRole || "org:member",
          permissions: orgRole === "org:admin" ? ["*"] : [""],
          updatedAt: new Date().toISOString(),
        },
      });

    const [application] = await tx
      .insert(applications)
      .values({
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        goviqEnabled,
        controlnetEnabled: input.controlnetEnabled,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    // 3. Insert the Stakeholder (using the fetched user details and a default role)
    const [stakeholder] = await tx
      .insert(stakeholders)
      .values({
        tenantId: application.tenantId,
        applicationId: application.id,
        userName: user.name || user.email,
        role: "member",
        email: user.email,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    // Create the application's three ControlNet policies in this same database
    // transaction. Any policy/link failure rolls back the application and its
    // stakeholder, preventing partially-created applications.
    const defaultPolicyNames = DEFAULT_APPLICATION_POLICIES.map(
      (definition) => definition.name,
    );
    const existingPolicyLinks = await tx
      .select({ policyName: applicationPolicies.policyName })
      .from(applicationPolicies)
      .where(
        and(
          eq(applicationPolicies.applicationId, application.id),
          eq(
            applicationPolicies.policyVersion,
            DEFAULT_APPLICATION_POLICY_VERSION,
          ),
          inArray(applicationPolicies.policyName, defaultPolicyNames),
        ),
      );
    const existingPolicyNames = new Set(
      existingPolicyLinks.map((link) => link.policyName),
    );
    const missingDefinitions = DEFAULT_APPLICATION_POLICIES.filter(
      (definition) => !existingPolicyNames.has(definition.name),
    );

    const createdPolicies = missingDefinitions.length
      ? await tx
          .insert(policies)
          .values(
            missingDefinitions.map((definition) => ({
              tenantId: input.tenantId,
              name: definition.name,
              version: DEFAULT_APPLICATION_POLICY_VERSION,
              slug: `${application.id}-${definition.profile}-policy`,
              description: definition.description,
              yaml: buildDefaultPolicyYaml(definition),
              isActive: true,
              status: "active" as const,
              compositionStrategy: {
                input: "allOf",
                output: "allOf",
                tool_args: "allOf",
                tool_result: "allOf",
              },
              metadata: {
                autoCreated: true,
                applicationId: application.id,
                defaultProfile: definition.profile,
                isApplicationDefault: definition.isDefault,
              },
              createdBy: userId,
              updatedBy: userId,
            })),
          )
          .returning({ id: policies.id, name: policies.name })
      : [];

    if (createdPolicies.length !== missingDefinitions.length) {
      throw new Error("Failed to create all default application policies");
    }

    const createdPolicyByName = new Map(
      createdPolicies.map((policy) => [policy.name, policy.id]),
    );

    if (missingDefinitions.length > 0) {
      await tx.insert(applicationPolicies).values(
        missingDefinitions.map((definition) => ({
          tenantId: input.tenantId,
          applicationId: application.id,
          policyId: createdPolicyByName.get(definition.name)!,
          policyName: definition.name,
          policyVersion: DEFAULT_APPLICATION_POLICY_VERSION,
          // The Launch policy is the application's selected default. Strict
          // and Development remain available but are not selected initially.
          isActive: definition.isDefault,
          isDefault: definition.isDefault,
          priority: definition.priority,
          createdBy: userId,
        })),
      );
    }

    // Link catalog guardrail rows when they are installed. The YAML remains the
    // executable ControlNet source of truth, so local setups without a seeded
    // guardrail catalog still receive valid default policies.
    const guardKeys = [
      ...new Set(
        missingDefinitions.flatMap((definition) =>
          definition.guards.map((guard) => guard.key),
        ),
      ),
    ];

    if (guardKeys.length > 0) {
      const catalogGuards = await tx
        .select({
          id: guardrails.id,
          key: guardrails.key,
          tenantId: guardrails.tenantId,
          defaultParams: guardrails.defaultParams,
        })
        .from(guardrails)
        .where(
          and(
            inArray(guardrails.key, guardKeys),
            or(
              eq(guardrails.tenantId, input.tenantId),
              isNull(guardrails.tenantId),
            ),
            isNull(guardrails.deletedAt),
          ),
        );

      const catalogGuardByKey = new Map<
        string,
        (typeof catalogGuards)[number]
      >();
      for (const guard of catalogGuards) {
        const current = catalogGuardByKey.get(guard.key);
        if (
          !current ||
          (current.tenantId === null && guard.tenantId !== null)
        ) {
          catalogGuardByKey.set(guard.key, guard);
        }
      }

      const policyGuardrailRows = missingDefinitions.flatMap((definition) => {
        const policyId = createdPolicyByName.get(definition.name)!;
        return definition.guards.flatMap((guard, orderIndex) => {
          const catalogGuard = catalogGuardByKey.get(guard.key);
          if (!catalogGuard) return [];

          return [
            {
              tenantId: input.tenantId,
              policyId,
              guardrailId: catalogGuard.id,
              phase: "input",
              params: {
                ...((catalogGuard.defaultParams as Record<string, unknown>) ||
                  {}),
                ...(guard.params || {}),
              },
              orderIndex,
              enabled: true,
              createdBy: userId,
              updatedBy: userId,
            },
          ];
        });
      });

      if (policyGuardrailRows.length > 0) {
        await tx.insert(policyGuardrails).values(policyGuardrailRows);
      }
    }

    return { application, stakeholder, tenantSlug: tenant.slug };
  });

  revalidatePath(`/${tenantSlug}/applications`);
  revalidatePath(`/${tenantSlug}/policies`);
  revalidatePath(
    `/${tenantSlug}/applications/${application.id}/control-net/policies`,
  );

  // Audit: application created
  try {
    await createAuditEvent({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: "application.created",
      targetType: "application",
      targetId: application.id,
      metadata: { name: application.name },
    });
  } catch (e) {
    console.error("Failed to write audit event (application.created):", e);
  }

  // Organization-level compliance policies are true defaults: a new
  // application is evaluated immediately and does not require another toggle.
  await applyActiveCompliancePoliciesToApplication(
    input.tenantId,
    application.id,
  );

  return {
    application,
    success: true,
    message: "Application created successfully",
  };
};

// Update application
export const updateApplication = async (input: UpdateApplicationInput) => {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Authentication required");
  }

  const { tenantId } = await requireActiveTenant();
  // Server actions don't enforce TS types at runtime: copy only editable fields,
  // so a caller can't rewrite tenantId/createdBy/etc.
  const { id, name, description, status, goviqEnabled, controlnetEnabled, metadata } =
    input;
  const updateData = { name, description, status, goviqEnabled, controlnetEnabled, metadata };
  const [application] = await db
    .update(applications)
    .set({
      ...updateData,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .returning();

  if (!application) {
    throw new Error("Application not found");
  }

  revalidatePath("/[tenant]/applications", "page");

  // Audit: application updated
  try {
    await createAuditEvent({
      tenantId: application.tenantId,
      actorUserId: userId,
      action: "application.updated",
      targetType: "application",
      targetId: application.id,
      metadata: { update: updateData },
    });
  } catch (e) {
    console.error("Failed to write audit event (application.updated):", e);
  }

  return application;
};

// Archive application
export const archiveApplication = async (id: string, tenantId: string) => {
  const { userId } = await auth();
  tenantId = (await requireTenantMember(tenantId)).tenantId;

  if (!userId) {
    throw new Error("Authentication required");
  }

  const [application] = await db
    .update(applications)
    .set({
      status: "Archived",
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(applications.id, id), eq(applications.tenantId, tenantId)))
    .returning();

  if (!application) {
    throw new Error("Application not found");
  }

  revalidatePath("/[tenant]/applications", "page");

  // Audit: application archived
  try {
    await createAuditEvent({
      tenantId: tenantId,
      actorUserId: userId,
      action: "application.archived",
      targetType: "application",
      targetId: application.id,
      metadata: { name: application.name },
    });
  } catch (e) {
    console.error("Failed to write audit event (application.archived):", e);
  }

  return { success: true };
};

export const updateStatusApplication = async (
  id: string,
  tenant: string,
  status: "Not Started" | "In Progress" | "Completed" | "Archived",
) => {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  const [application] = await db
    .update(applications)
    .set({
      status,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(applications.id, id), eq(applications.tenantId, orgId)))
    .returning();

  if (!application) {
    throw new Error("Application not found");
  }

  console.log("[HERE] ", application);
  revalidatePath(`/${tenant}/applications/${id}/goviq/overview`);

  // Audit: application status updated
  try {
    await createAuditEvent({
      tenantId: orgId,
      actorUserId: userId,
      action: "application.status_updated",
      targetType: "application",
      targetId: application.id,
      metadata: { status },
    });
  } catch (e) {
    console.error(
      "Failed to write audit event (application.status_updated):",
      e,
    );
  }

  return { success: true };
};

// Get applications with pagination and search
export const getApplications = async (
  tenantSlug: string,
  page?: number,
  pageSize?: number,
  search?: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  await requireTenantMember(tenantSlug);

  const pageNum = page && page > 0 ? page : 1;
  const limit = pageSize && pageSize > 0 ? Math.min(pageSize, 200) : 20;
  const searchTerm = search?.trim();

  const tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    return {
      applications: [],
      total: 0,
      pagination: { page: pageNum, pageSize: limit, totalPages: 1 },
    };
  }
  const tenantId = tenantRow[0].id;

  let apps;
  let total = 0;

  if (searchTerm) {
    const allApps = await getApplicationsWithSummary(tenantId);
    const filtered = allApps.filter(
      (app) =>
        app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (app.description?.toLowerCase() || "").includes(
          searchTerm.toLowerCase(),
        ),
    );
    total = filtered.length;
    const offset = (pageNum - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);
    apps = paginated;
  } else {
    const allApps = await getApplicationsWithSummary(tenantId);
    total = allApps.length;
    const offset = (pageNum - 1) * limit;
    apps = allApps.slice(offset, offset + limit);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    applications: apps.map((app) => ({
      id: app.id,
      name: app.name,
      slug: app.slug,
      status: app.status as
        | "Not Started"
        | "In Progress"
        | "Completed"
        | "Archived",

      goviqEnabled: app.goviqEnabled,
      controlnetEnabled: app.controlnetEnabled,
      description: app.description,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      createdBy: app.createdByUser,
      updatedBy: app.updatedByUser,
      stats: app.stats,
    })),
    total,
    pagination: { page: pageNum, pageSize: limit, totalPages },
  };
};

// Restore archived application
export const restoreApplication = async (id: string, tenantId: string) => {
  const { userId } = await auth();
  tenantId = (await requireTenantMember(tenantId)).tenantId;
  if (!userId) throw new Error("Authentication required");

  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);
  if (!app.length || app[0].tenantId !== tenantId) {
    throw new Error("Application not found");
  }
  if (app[0].status !== "Archived") {
    throw new Error("Application is not archived");
  }

  const [application] = await db
    .update(applications)
    .set({
      status: "Not Started",
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(applications.id, id))
    .returning();

  revalidatePath("/[tenant]/applications", "page");

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "application.restored",
      targetType: "application",
      targetId: application.id,
    });
  } catch (e) {
    console.error("Failed to write audit event (application.restored):", e);
  }

  return { success: true };
};

// Hard delete application (permanently delete)
export const hardDeleteApplication = async (id: string, tenantId: string) => {
  const { userId } = await auth();
  tenantId = (await requireTenantMember(tenantId)).tenantId;
  if (!userId) throw new Error("Authentication required");

  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);
  if (!app.length || app[0].tenantId !== tenantId) {
    throw new Error("Application not found");
  }
  if (app[0].status !== "Archived") {
    throw new Error("Only archived applications can be permanently deleted");
  }

  // Hard delete - permanently remove from database
  await db.delete(applications).where(eq(applications.id, id));

  revalidatePath("/[tenant]/admin/archived-applications", "page");

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "application.deleted",
      targetType: "application",
      targetId: id,
      metadata: { name: app[0].name },
    });
  } catch (e) {
    console.error("Failed to write audit event (application.deleted):", e);
  }

  return { success: true };
};

// Get archived applications with pagination and search
export const getArchivedApplicationsAction = async (
  tenantSlug: string,
  page?: number,
  pageSize?: number,
  search?: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  await requireTenantMember(tenantSlug);

  const pageNum = page && page > 0 ? page : 1;
  const limit = pageSize && pageSize > 0 ? Math.min(pageSize, 200) : 20;
  const searchTerm = search?.trim();

  const tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    return {
      applications: [],
      total: 0,
      pagination: { page: pageNum, pageSize: limit, totalPages: 1 },
    };
  }
  const tenantId = tenantRow[0].id;

  // Get total count first
  const countConditions = [
    eq(applications.tenantId, tenantId),
    isNull(applications.deletedAt),
    eq(applications.status, "Archived"),
  ];

  if (searchTerm) {
    const term = `%${searchTerm}%`;
    const searchCondition = or(
      ilike(applications.name, term),
      ilike(applications.description, term),
    );
    if (searchCondition) {
      countConditions.push(searchCondition);
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(distinct ${applications.id})` })
    .from(applications)
    .where(and(...countConditions));

  const total = Number(count) || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Get paginated apps
  const apps = await getArchivedApplications(
    tenantId,
    searchTerm,
    pageNum,
    limit,
  );

  return {
    applications: apps.map((app) => ({
      id: app.id,
      name: app.name,
      slug: app.slug,
      description: app.description,
      status: app.status as
        | "Not Started"
        | "In Progress"
        | "Completed"
        | "Archived",
      goviqEnabled: app.goviqEnabled,
      controlnetEnabled: app.controlnetEnabled,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      archivedAt: app.updatedAt,
      archivedBy:
        app.archivedByName || app.archivedByEmail || app.updatedBy || "Unknown",
    })),
    total,
    pagination: { page: pageNum, pageSize: limit, totalPages },
  };
};

// Get single application by ID (simple query)
export const getApplicationById = async (
  tenantSlugOrId: string,
  applicationId: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  await requireTenantMember(tenantSlugOrId);

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

  // Get application
  const application = await db.query.applications.findFirst({
    where: and(
      eq(applications.id, applicationId),
      eq(applications.tenantId, tenantId),
      isNull(applications.deletedAt),
    ),
    columns: {
      id: true,
      name: true,
      description: true,
      status: true,
      goviqEnabled: true,
      controlnetEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  return application;
};

// Get application details for overview page
export const getApplicationDetails = async (
  tenantSlugOrId: string,
  applicationId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

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
    throw new Error("Tenant not found");
  }

  // Get application with related data
  const result = await db.query.applications.findFirst({
    where: and(
      eq(applications.id, applicationId),
      eq(applications.tenantId, tenantId),
    ),
    columns: {
      id: true,
      name: true,
      description: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
    },
    with: {
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
      stakeholders: {
        columns: {
          id: true,
          userName: true,
          role: true,
          email: true,
          department: true,
          responsibilities: true,
        },
      },
      useCases: {
        where: (useCases, { isNull }) => isNull(useCases.deletedAt),
        columns: {
          id: true,
          function: true,
          useCase: true,
          whatItDoes: true,
          keyInputs: true,
          primaryOutputs: true,
          businessImpact: true,
          kpis: true,
        },
      },
    },
  });

  if (!result) {
    throw new Error("Application not found");
  }

  return {
    application: {
      id: result.id,
      name: result.name,
      description: result.description,
      status: result.status,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    },
    owner: {
      id: result.user_createdBy,
      name: result.user_createdBy?.name || "Unknown",
      email: result.user_createdBy?.email || "",
    },
    lastUpdated: {
      date: result.updatedAt,
      by: {
        id: result.updatedBy,
        name: result.user_updatedBy?.name || "Unknown",
        email: result.user_updatedBy?.email || "",
      },
    },
    stakeholders: result.stakeholders.map((stakeholder) => ({
      id: stakeholder.id,
      name: stakeholder.userName,
      role: stakeholder.role,
      email: stakeholder.email,
      department: stakeholder.department,
      responsibilities: stakeholder.responsibilities,
    })),
    useCases: result.useCases.map((useCase) => ({
      id: useCase.id,
      function: useCase.function,
      useCase: useCase.useCase,
      whatItDoes: useCase.whatItDoes,
      keyInputs: useCase.keyInputs,
      primaryOutputs: useCase.primaryOutputs,
      businessImpact: useCase.businessImpact,
      kpis: useCase.kpis,
    })),
  };
};
