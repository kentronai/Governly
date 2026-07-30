"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { agents, db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import { deleteConnection } from "@/lib/server/nango/client";
import {
  normalizeDatabricksHost,
  runDatabricksDiscoveryScan,
  testDatabricksConnection,
} from "@/lib/server/databricks/discovery-orchestrator";

const INTEGRATION_NAME = "Databricks Unity Catalog";
const LEGACY_INTEGRATION_NAME = "Databricks";

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

export async function ensureDatabricksIntegrationCatalogEntry(
  tenantSlugOrId: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  let existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, INTEGRATION_NAME),
    ),
  });
  if (!existing) {
    existing = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.name, LEGACY_INTEGRATION_NAME),
      ),
    });
  }
  const description =
    "Discovers deployed agents across Databricks Apps, Model Serving, Genie, Jobs, and workspace notebooks, with Unity Catalog governance evidence.";
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        name: INTEGRATION_NAME,
        category: "data_platforms",
        description,
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
      category: "data_platforms",
      description,
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

async function connection(tenantId: string, id: string) {
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)),
  });
  if (!row || ![INTEGRATION_NAME, LEGACY_INTEGRATION_NAME].includes(row.name)) {
    throw new Error("Databricks Unity Catalog connection not found");
  }
  return row;
}

export async function createDatabricksConnection(input: {
  tenantSlugOrId: string;
  workspaceUrl: string;
  accessToken: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  const hostUrl = normalizeDatabricksHost(input.workspaceUrl);
  const accessToken = input.accessToken.trim();
  if (!accessToken) throw new Error("Databricks access token is required");
  const integration = await ensureDatabricksIntegrationCatalogEntry(
    input.tenantSlugOrId,
  );
  const [updated] = await db
    .update(integrations)
    .set({
      configuration: {
        hostUrl,
        authentication: "personal_access_token",
        discoveryScopes: [
          "unity-catalog",
          "serving-endpoints",
          "apps",
          "jobs",
          "genie",
          "workspace",
          "current-user",
        ],
      },
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ hostUrl, accessToken }),
      ),
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
    action: "databricks_connection.created",
    targetType: "integration",
    targetId: updated.id,
    metadata: { hostUrl, authentication: "personal_access_token" },
  });
  return { id: updated.id, hostUrl };
}

export async function testDatabricksIntegrationConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  const result = await testDatabricksConnection(row);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "databricks_connection.tested",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  return result;
}

export async function triggerDatabricksDiscovery(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  const result = await runDatabricksDiscoveryScan(tenantId, id, row, userId);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "databricks_discovery.manual_scan",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  for (const route of [
    "ai-agent-inventory",
    "ai-agent-discovery/dashboard",
    "ai-agent-discovery/journey",
    "admin/integrations",
  ]) {
    revalidatePath(`/${tenantSlugOrId}/${route}`);
  }
  return result;
}

/**
 * Store the Databricks workspace URL (non-secret) on the integration row so a
 * Nango-backed connection can route Proxy calls. The PAT itself is authorized
 * separately through the Nango Connect widget. Call this before/with connecting.
 */
export async function saveDatabricksWorkspaceUrl(input: {
  tenantSlugOrId: string;
  id: string;
  workspaceUrl: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  const row = await connection(tenantId, input.id);
  const hostUrl = normalizeDatabricksHost(input.workspaceUrl);
  const [updated] = await db
    .update(integrations)
    .set({
      configuration: {
        ...((row.configuration as Record<string, unknown>) ?? {}),
        hostUrl,
        authentication: "nango",
      },
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(integrations.id, input.id), eq(integrations.tenantId, tenantId)))
    .returning();
  return updated;
}

export async function deleteDatabricksConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  // Best-effort: remove the credential from the Nango vault too.
  if (row.nangoConnectionId && row.nangoProviderConfigKey) {
    try {
      await deleteConnection(row.nangoConnectionId, row.nangoProviderConfigKey);
    } catch (error) {
      console.error("Failed to delete Nango connection for Databricks:", error);
    }
  }
  await db
    .delete(agents)
    .where(and(eq(agents.integrationId, id), eq(agents.tenantId, tenantId)));
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
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, id));
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "databricks_connection.deleted",
    targetType: "integration",
    targetId: id,
  });
}
