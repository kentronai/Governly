"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { agents, db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import {
  normalizeDatabricksHost,
  runDatabricksDiscoveryScan,
  testDatabricksConnection,
} from "@/lib/server/databricks/discovery-orchestrator";

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
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, "Databricks"),
    ),
  });
  const description =
    "Discovers Unity Catalog catalogs, schemas, tables, registered models, and Model Serving endpoints with real governance evidence.";
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
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
      name: "Databricks",
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
  if (!row || row.name !== "Databricks") {
    throw new Error("Databricks connection not found");
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
        discoveryScopes: ["unity-catalog", "serving-endpoints", "current-user"],
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
    "ai-agent-discovery/autonomy",
    "ai-agent-discovery/journey",
    "admin/integrations",
  ]) {
    revalidatePath(`/${tenantSlugOrId}/${route}`);
  }
  return result;
}

export async function deleteDatabricksConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  await connection(tenantId, id);
  await db
    .delete(agents)
    .where(and(eq(agents.integrationId, id), eq(agents.tenantId, tenantId)));
  await db
    .update(integrations)
    .set({
      configuration: {},
      credentialsEncrypted: null,
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
