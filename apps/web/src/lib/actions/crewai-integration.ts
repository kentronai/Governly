"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { agents, db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import { deleteConnection } from "@/lib/server/nango/client";
import {
  CREWAI_DEFAULT_BASE_URL,
  normalizeCrewAIBaseUrl,
} from "@/lib/server/crewai/api-client";
import {
  runCrewAIDiscoveryScan,
  testCrewAIConnection,
} from "@/lib/server/crewai/discovery-orchestrator";

const INTEGRATION_NAME = "CrewAI";

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

export async function ensureCrewAIIntegrationCatalogEntry(
  tenantSlugOrId: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, INTEGRATION_NAME),
    ),
  });
  const description =
    "Discovers crews deployed on the CrewAI Enterprise (AMP) platform and governs each as an autonomous multi-agent workload.";
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        category: "agent_frameworks",
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
      category: "agent_frameworks",
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
  if (!row || row.name !== INTEGRATION_NAME) {
    throw new Error("CrewAI connection not found");
  }
  return row;
}

/**
 * Managed CrewAI only needs the Bearer token: the API base is the well-known
 * cloud host, defaulted here. `baseUrl` stays overridable for self-hosted.
 */
export async function createCrewAIConnection(input: {
  tenantSlugOrId: string;
  accessToken: string;
  baseUrl?: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  const accessToken = input.accessToken.trim();
  if (!accessToken) throw new Error("CrewAI access token is required");
  const baseUrl = input.baseUrl?.trim()
    ? normalizeCrewAIBaseUrl(input.baseUrl)
    : CREWAI_DEFAULT_BASE_URL;
  const integration = await ensureCrewAIIntegrationCatalogEntry(
    input.tenantSlugOrId,
  );
  const [updated] = await db
    .update(integrations)
    .set({
      configuration: { baseUrl, authentication: "bearer_token" },
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ baseUrl, accessToken }),
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
    action: "crewai_connection.created",
    targetType: "integration",
    targetId: updated.id,
    metadata: { baseUrl, authentication: "bearer_token" },
  });
  return { id: updated.id, baseUrl };
}

export async function testCrewAIIntegrationConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  const result = await testCrewAIConnection(row);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "crewai_connection.tested",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  return result;
}

export async function triggerCrewAIDiscovery(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  const result = await runCrewAIDiscoveryScan(tenantId, id, row, userId);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "crewai_discovery.manual_scan",
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

export async function deleteCrewAIConnection(
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
      console.error("Failed to delete Nango connection for CrewAI:", error);
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
    action: "crewai_connection.deleted",
    targetType: "integration",
    targetId: id,
  });
}
