"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, integrations, langsmithRuns, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import { deleteConnection } from "@/lib/server/nango/client";
import {
  LANGSMITH_DEFAULT_BASE_URL,
  normalizeLangSmithBaseUrl,
} from "@/lib/server/langsmith/api-client";
import {
  listLangSmithProjects,
  loadLangSmithConnection,
  syncLangSmithRuns,
  testLangSmithConnection,
  type LangSmithProject,
} from "@/lib/server/langsmith/sync-orchestrator";

const INTEGRATION_NAME = "LangSmith";
const DESCRIPTION =
  "Streams LangSmith execution traces, runs, prompts, tool calls, tokens, cost, latency, and errors into the Observability dashboard.";

async function context(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, slugOrId))
    .limit(1);
  if (!rows.length) {
    rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slugOrId))
      .limit(1);
  }
  if (!rows.length || rows[0].id !== orgId) {
    throw new Error("Tenant access denied");
  }
  return { tenantId: orgId, userId };
}

export async function ensureLangSmithIntegrationCatalogEntry(
  tenantSlugOrId: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, INTEGRATION_NAME),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        category: "observability",
        description: DESCRIPTION,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrations.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(integrations)
    .values({
      tenantId,
      name: INTEGRATION_NAME,
      category: "observability",
      description: DESCRIPTION,
      configuration: {},
      metadata: {},
      isEnabled: false,
      isCredentialsAdded: false,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  return created;
}

/**
 * Direct (non-Nango) fallback: NORIX collects the API key in its own form and
 * stores it encrypted. The primary path is the Nango Connect popup, handled by
 * the shared /api/integrations/action `nangoConnected` route.
 */
export async function createLangSmithConnection(input: {
  tenantSlugOrId: string;
  apiKey: string;
  baseUrl?: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("LangSmith API key is required");
  const baseUrl = input.baseUrl?.trim()
    ? normalizeLangSmithBaseUrl(input.baseUrl)
    : LANGSMITH_DEFAULT_BASE_URL;
  const integration = await ensureLangSmithIntegrationCatalogEntry(
    input.tenantSlugOrId,
  );
  const [updated] = await db
    .update(integrations)
    .set({
      configuration: { baseUrl, authentication: "api_key" },
      credentialsEncrypted: encryptSecret(JSON.stringify({ baseUrl, apiKey })),
      isCredentialsAdded: true,
      isEnabled: true,
      syncStatus: "pending",
      errorMessage: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(integrations.id, integration.id),
        eq(integrations.tenantId, tenantId),
      ),
    )
    .returning();
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "langsmith_connection.created",
    targetType: "integration",
    targetId: updated.id,
    metadata: { baseUrl, authentication: "api_key" },
  });
  return { id: updated.id, baseUrl };
}

export async function testLangSmithIntegrationConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await loadLangSmithConnection(tenantId, id);
  const result = await testLangSmithConnection(row);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "langsmith_connection.tested",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  return result;
}

export async function listLangSmithIntegrationProjects(
  tenantSlugOrId: string,
  id: string,
): Promise<LangSmithProject[]> {
  const { tenantId } = await context(tenantSlugOrId);
  const row = await loadLangSmithConnection(tenantId, id);
  return listLangSmithProjects(row);
}

/**
 * List LangSmith projects for the tenant's connected LangSmith integration
 * without the caller needing the integration id — used by the per-agent
 * Observability tab to populate its project picker. Returns [] when LangSmith
 * isn't connected yet.
 */
export async function listTenantLangSmithProjects(
  tenantSlugOrId: string,
): Promise<LangSmithProject[]> {
  const { tenantId } = await context(tenantSlugOrId);
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, INTEGRATION_NAME),
    ),
  });
  if (!integration) return [];
  const row = await loadLangSmithConnection(tenantId, integration.id);
  return listLangSmithProjects(row);
}

export async function setLangSmithProject(
  tenantSlugOrId: string,
  id: string,
  project: string,
  projectName?: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await loadLangSmithConnection(tenantId, id);
  const configuration = (row.configuration as Record<string, unknown>) ?? {};
  await db
    .update(integrations)
    .set({
      // `project` is the LangSmith session/project id used to filter the runs
      // query; `projectName` is the human label shown in the dashboard.
      configuration: {
        ...configuration,
        project: project.trim(),
        projectName: (projectName ?? project).trim(),
      },
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, id));
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "langsmith_connection.project_set",
    targetType: "integration",
    targetId: id,
    metadata: { project, projectName },
  });
  return { ok: true };
}

export async function triggerLangSmithSync(tenantSlugOrId: string, id: string) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await loadLangSmithConnection(tenantId, id);
  const result = await syncLangSmithRuns(tenantId, id, row);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "langsmith_sync.manual",
    targetType: "integration",
    targetId: id,
    metadata: { ...result },
  });
  for (const route of ["observability", "admin/integrations"]) {
    revalidatePath(`/${tenantSlugOrId}/${route}`);
  }
  // Present the same shape the marketplace UI expects from a discovery run.
  return {
    status: result.status,
    agentsDiscovered: result.runsDiscovered,
    errorMessage: result.errorMessage,
  };
}

export async function deleteLangSmithConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await loadLangSmithConnection(tenantId, id);
  if (row.nangoConnectionId && row.nangoProviderConfigKey) {
    try {
      await deleteConnection(row.nangoConnectionId, row.nangoProviderConfigKey);
    } catch (error) {
      console.error("Failed to delete Nango connection for LangSmith:", error);
    }
  }
  await db
    .delete(langsmithRuns)
    .where(
      and(
        eq(langsmithRuns.integrationId, id),
        eq(langsmithRuns.tenantId, tenantId),
      ),
    );
  await db
    .update(integrations)
    .set({
      configuration: {},
      credentialsEncrypted: null,
      nangoConnectionId: null,
      nangoProviderConfigKey: null,
      isCredentialsAdded: false,
      isEnabled: false,
      syncStatus: null,
      errorMessage: null,
      lastSyncAt: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, id));
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "langsmith_connection.deleted",
    targetType: "integration",
    targetId: id,
  });
}
