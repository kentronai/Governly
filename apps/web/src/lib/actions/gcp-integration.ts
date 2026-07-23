"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { agents, db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import {
  runGoogleCloudDiscoveryScan,
  testGoogleCloudConnection,
  type GoogleServiceAccount,
} from "@/lib/server/gcp/discovery-orchestrator";

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
  if (!rows.length || rows[0].id !== orgId)
    throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

export async function ensureGoogleCloudIntegrationCatalogEntry(
  tenantSlugOrId: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, "Google Cloud"),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        description:
          "Discovers Vertex AI Agent Engine and explicitly identified agent workloads on Cloud Run, Compute Engine, GKE, and Cloud Functions.",
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
      name: "Google Cloud",
      category: "cloud_providers",
      description:
        "Discovers Vertex AI Agent Engine and explicitly identified agent workloads on Cloud Run, Compute Engine, GKE, and Cloud Functions.",
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

function parseServiceAccount(value: string): GoogleServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Service account must be valid JSON");
  }
  const account = parsed as Partial<GoogleServiceAccount>;
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error(
      "Service account JSON must include project_id, client_email, and private_key",
    );
  }
  return account as GoogleServiceAccount;
}

export async function createGoogleCloudConnection(input: {
  tenantSlugOrId: string;
  projectId: string;
  serviceAccountJson: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  const account = parseServiceAccount(input.serviceAccountJson.trim());
  const projectId = input.projectId.trim() || account.project_id;
  if (account.project_id !== projectId) {
    throw new Error(
      "Project ID must match project_id in the service account JSON",
    );
  }
  const integration = await ensureGoogleCloudIntegrationCatalogEntry(
    input.tenantSlugOrId,
  );
  const [updated] = await db
    .update(integrations)
    .set({
      configuration: { projectId, authentication: "service_account" },
      credentialsEncrypted: encryptSecret(JSON.stringify(account)),
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
    action: "gcp_connection.created",
    targetType: "integration",
    targetId: updated.id,
    metadata: { projectId, clientEmail: account.client_email },
  });
  return { id: updated.id, projectId };
}

async function connection(tenantId: string, id: string) {
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)),
  });
  if (!row || row.name !== "Google Cloud") {
    throw new Error("Google Cloud connection not found");
  }
  return row;
}

export async function testGoogleCloudIntegrationConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  const result = await testGoogleCloudConnection(row);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "gcp_connection.tested",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  return result;
}

export async function triggerGoogleCloudDiscovery(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await connection(tenantId, id);
  const result = await runGoogleCloudDiscoveryScan(tenantId, id, row, userId);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "gcp_discovery.manual_scan",
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

export async function deleteGoogleCloudConnection(
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
    action: "gcp_connection.deleted",
    targetType: "integration",
    targetId: id,
  });
}
