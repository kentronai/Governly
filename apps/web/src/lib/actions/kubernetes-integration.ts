"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { agents, db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import {
  runKubernetesDiscoveryScan,
  testKubernetesConnection,
} from "@/lib/server/kubernetes/discovery-orchestrator";

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

async function integration(tenantId: string, id: string) {
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)),
  });
  if (!row || row.name !== "Kubernetes Cluster") {
    throw new Error("Kubernetes Cluster integration not found");
  }
  return row;
}

export async function createKubernetesConnection(input: {
  tenantSlugOrId: string;
  integrationId: string;
  clusterName: string;
  apiServer: string;
  bearerToken: string;
  caCertificate?: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  const row = await integration(tenantId, input.integrationId);
  const credentials = {
    provider: "kubernetes",
    clusterName: input.clusterName.trim(),
    apiServer: input.apiServer.trim().replace(/\/+$/, ""),
    bearerToken: input.bearerToken.trim(),
    caCertificate: input.caCertificate?.trim(),
  };
  if (
    !credentials.clusterName ||
    !credentials.apiServer ||
    !credentials.bearerToken ||
    !credentials.caCertificate
  ) {
    throw new Error(
      "Cluster name, API server URL, bearer token, and cluster CA certificate are required",
    );
  }
  const validation = await testKubernetesConnection({
    id: row.id,
    credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
    configuration: row.configuration,
  });
  if (!validation.ok) {
    await db
      .update(integrations)
      .set({
        credentialsEncrypted: null,
        isCredentialsAdded: false,
        isEnabled: false,
        syncStatus: "failed",
        errorMessage: validation.error,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrations.id, row.id));
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "kubernetes_connection.validation_failed",
      targetType: "integration",
      targetId: row.id,
      metadata: {
        clusterName: credentials.clusterName,
        apiServer: credentials.apiServer,
        caCertificateProvided: Boolean(credentials.caCertificate),
        error: validation.error,
      },
    });
    throw new Error(validation.error);
  }
  const [updated] = await db
    .update(integrations)
    .set({
      configuration: {
        ...((row.configuration as Record<string, unknown>) ?? {}),
        provider: "kubernetes",
        clusterName: credentials.clusterName,
        apiServer: credentials.apiServer,
        authentication: "service_account_token",
        tls:
          credentials.caCertificate !== undefined
            ? "custom_ca"
            : "system_trust_store",
        providerType: validation.providerType,
        clusterVersion: validation.version,
      },
      credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
      isCredentialsAdded: true,
      isEnabled: true,
      syncStatus: "pending",
      errorMessage: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, row.id))
    .returning();
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "kubernetes_connection.created",
    targetType: "integration",
    targetId: updated.id,
    metadata: {
      clusterName: credentials.clusterName,
      apiServer: credentials.apiServer,
      caCertificateProvided: Boolean(credentials.caCertificate),
      providerType: validation.providerType,
      clusterVersion: validation.version,
    },
  });
  return { id: updated.id, clusterName: credentials.clusterName };
}

export async function testKubernetesIntegrationConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await integration(tenantId, id);
  const result = await testKubernetesConnection(row);
  if (result.ok) {
    await db
      .update(integrations)
      .set({
        configuration: {
          ...((row.configuration as Record<string, unknown>) ?? {}),
          providerType: result.providerType,
          clusterVersion: result.version,
        },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrations.id, id));
  }
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "kubernetes_connection.tested",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  return result;
}

export async function triggerKubernetesDiscovery(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await integration(tenantId, id);
  const result = await runKubernetesDiscoveryScan(tenantId, id, row, userId);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "kubernetes_discovery.manual_scan",
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

export async function deleteKubernetesConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  await integration(tenantId, id);
  await db
    .delete(agents)
    .where(and(eq(agents.integrationId, id), eq(agents.tenantId, tenantId)));
  await db
    .update(integrations)
    .set({
      configuration: {
        endpoint: "/api/agent-discovery/ingest",
        authentication: "x-api-key",
        provider: "kubernetes",
      },
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
    action: "kubernetes_connection.deleted",
    targetType: "integration",
    targetId: id,
  });
}
