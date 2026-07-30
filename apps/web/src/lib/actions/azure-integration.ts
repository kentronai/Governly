"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { azureDiscoveryConnections, db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import { getConnectionCredentials } from "@/lib/server/nango/client";
import {
  runAzureDiscoveryScan,
  testAzureConnection,
} from "@/lib/server/azure/discovery-orchestrator";

/** Reads the first non-empty string across credential/connection-config keys. */
function pickCredential(
  credentials: Record<string, unknown>,
  connectionConfig: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = credentials[key] ?? connectionConfig[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function context(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, slugOrId))
    .limit(1);
  if (!rows.length)
    rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slugOrId))
      .limit(1);
  if (!rows.length || rows[0].id !== orgId)
    throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

export async function ensureAzureIntegrationCatalogEntry(
  tenantSlugOrId: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, "Azure"),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        description:
          "Discovers Azure OpenAI, AI Foundry, and identified agent workloads on Functions, Logic Apps, VMs, Container Apps, and AKS.",
        // Connected integrations are always active; the old separate
        // enable/disable control was intentionally removed from the UI.
        isEnabled: existing.isCredentialsAdded || existing.isEnabled,
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
      name: "Azure",
      category: "cloud_providers",
      description:
        "Discovers Azure OpenAI, AI Foundry, and identified agent workloads on Functions, Logic Apps, VMs, Container Apps, and AKS.",
      configuration: {},
      metadata: {},
      isEnabled: false,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  return created;
}

export async function createAzureConnection(input: {
  tenantSlugOrId: string;
  azureTenantId: string;
  subscriptionId: string;
  clientId: string;
  clientSecret: string;
}) {
  const { tenantId, userId } = await context(input.tenantSlugOrId);
  for (const [label, value] of [
    ["Azure tenant ID", input.azureTenantId],
    ["Subscription ID", input.subscriptionId],
    ["Client ID", input.clientId],
    ["Client secret", input.clientSecret],
  ] as const)
    if (!value.trim()) throw new Error(`${label} is required`);
  const encryptedClientSecret = encryptSecret(input.clientSecret.trim());
  const existing = await db.query.azureDiscoveryConnections.findFirst({
    where: and(
      eq(azureDiscoveryConnections.tenantId, tenantId),
      eq(azureDiscoveryConnections.subscriptionId, input.subscriptionId.trim()),
    ),
  });
  const values = {
    azureTenantId: input.azureTenantId.trim(),
    subscriptionId: input.subscriptionId.trim(),
    clientId: input.clientId.trim(),
    encryptedClientSecret,
    isEnabled: true,
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  };
  const [row] = existing
    ? await db
        .update(azureDiscoveryConnections)
        .set(values)
        .where(eq(azureDiscoveryConnections.id, existing.id))
        .returning()
    : await db
        .insert(azureDiscoveryConnections)
        .values({ tenantId, name: "Azure", ...values, createdBy: userId })
        .returning();
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: existing ? "azure_connection.updated" : "azure_connection.created",
    targetType: "azure_discovery_connection",
    targetId: row.id,
    metadata: {
      subscriptionId: input.subscriptionId,
      azureTenantId: input.azureTenantId,
    },
  });
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    clientId: row.clientId,
    azureTenantId: row.azureTenantId,
  };
}

/**
 * Bridge a Nango-authorized Azure account into the discovery model. After the
 * Nango Connect popup, the webhook records the connection on the integration
 * row; this reads the service-principal back from the Nango vault and upserts
 * the `azureDiscoveryConnections` row the existing discovery engine runs on, so
 * Azure joins the uniform Nango popup flow without changing discovery itself.
 *
 * Expected Nango `azure` credentials (custom/API-key config, not the OAuth
 * template): `tenantId`, `subscriptionId`, `clientId`, `clientSecret`.
 */
export async function syncAzureConnectionFromNango(
  tenantSlugOrId: string,
  integrationId: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, integrationId),
      eq(integrations.tenantId, tenantId),
    ),
  });
  if (!integration || integration.name !== "Azure") {
    throw new Error("Azure integration not found");
  }
  if (!integration.nangoConnectionId || !integration.nangoProviderConfigKey) {
    throw new Error("Azure account is not connected through Nango yet");
  }
  // The Nango `azure-service-principal` provider stores clientId/clientSecret as
  // credentials and tenantId/subscriptionId as connection config. pickCredential
  // reads across both.
  const { credentials, connectionConfig } = await getConnectionCredentials(
    integration.nangoConnectionId,
    integration.nangoProviderConfigKey,
  );
  const azureTenantId = pickCredential(
    credentials,
    connectionConfig,
    "tenantId",
    "azureTenantId",
    "tenant_id",
  );
  const subscriptionId = pickCredential(
    credentials,
    connectionConfig,
    "subscriptionId",
    "subscription_id",
  );
  const clientId = pickCredential(
    credentials,
    connectionConfig,
    "clientId",
    "client_id",
  );
  const clientSecret = pickCredential(
    credentials,
    connectionConfig,
    "clientSecret",
    "client_secret",
    "secret",
  );
  if (!azureTenantId || !subscriptionId || !clientId || !clientSecret) {
    throw new Error(
      "Nango is missing the Azure tenant ID, subscription ID, client ID, or client secret",
    );
  }
  const encryptedClientSecret = encryptSecret(clientSecret);
  const existing = await db.query.azureDiscoveryConnections.findFirst({
    where: and(
      eq(azureDiscoveryConnections.tenantId, tenantId),
      eq(azureDiscoveryConnections.subscriptionId, subscriptionId),
    ),
  });
  const values = {
    azureTenantId,
    subscriptionId,
    clientId,
    encryptedClientSecret,
    isEnabled: true,
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  };
  const [row] = existing
    ? await db
        .update(azureDiscoveryConnections)
        .set(values)
        .where(eq(azureDiscoveryConnections.id, existing.id))
        .returning()
    : await db
        .insert(azureDiscoveryConnections)
        .values({ tenantId, name: "Azure", ...values, createdBy: userId })
        .returning();
  await db
    .update(integrations)
    .set({
      configuration: {
        ...((integration.configuration as Record<string, unknown>) ?? {}),
        azureConnectionId: row.id,
        subscriptionId: row.subscriptionId,
        authentication: "service_principal",
      },
      isCredentialsAdded: true,
      isEnabled: true,
      errorMessage: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, integrationId));
  return { azureConnectionId: row.id };
}

export async function testAzureIntegrationConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await db.query.azureDiscoveryConnections.findFirst({
    where: and(
      eq(azureDiscoveryConnections.id, id),
      eq(azureDiscoveryConnections.tenantId, tenantId),
    ),
  });
  if (!row) throw new Error("Azure connection not found");
  const result = await testAzureConnection(row);
  await db
    .update(azureDiscoveryConnections)
    .set({
      lastValidatedAt: new Date().toISOString(),
      lastValidationError: result.ok ? null : result.error,
    })
    .where(eq(azureDiscoveryConnections.id, id));
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "azure_connection.tested",
    targetType: "azure_discovery_connection",
    targetId: id,
    metadata: result,
  });
  return result;
}

export async function triggerAzureDiscovery(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await db.query.azureDiscoveryConnections.findFirst({
    where: and(
      eq(azureDiscoveryConnections.id, id),
      eq(azureDiscoveryConnections.tenantId, tenantId),
    ),
  });
  if (!row) throw new Error("Azure connection not found");
  const result = await runAzureDiscoveryScan(tenantId, id, row, userId);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "azure_discovery.manual_scan",
    targetType: "azure_discovery_connection",
    targetId: id,
    metadata: result,
  });
  for (const route of [
    "ai-agent-inventory",
    "ai-agent-discovery/dashboard",
    "ai-agent-discovery/journey",
    "admin/integrations",
  ])
    revalidatePath(`/${tenantSlugOrId}/${route}`);
  return result;
}

export async function deleteAzureConnection(
  tenantSlugOrId: string,
  id: string,
) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const [deleted] = await db
    .delete(azureDiscoveryConnections)
    .where(
      and(
        eq(azureDiscoveryConnections.id, id),
        eq(azureDiscoveryConnections.tenantId, tenantId),
      ),
    )
    .returning({ id: azureDiscoveryConnections.id });
  if (!deleted) throw new Error("Azure connection not found");
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "azure_connection.deleted",
    targetType: "azure_discovery_connection",
    targetId: id,
  });
}
