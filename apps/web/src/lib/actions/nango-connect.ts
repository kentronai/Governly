/**
 * Connect a provider through self-hosted Nango WITHOUT the hosted Connect UI.
 * NORIX collects credentials in its own shadcn forms and this action stores them
 * in the Nango vault via the API, then records the connection reference on the
 * integration row. Discovery later calls the Nango Proxy with that connection.
 */
"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import {
  createConnectionWithCredentials,
  deleteConnection,
  NangoError,
} from "@/lib/server/nango/client";

async function resolveTenant(slugOrId: string) {
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
  if (!rows.length) throw new Error("Tenant not found");
  return rows[0];
}

export interface ConnectViaNangoInput {
  tenantSlugOrId: string;
  integrationId: string;
  providerConfigKey: string;
  /** Nango credential object, shape depends on the connector's auth_mode. */
  credentials: Record<string, unknown>;
  /** Non-secret per-connection settings (region, organizationUrl, …). */
  connectionConfig?: Record<string, unknown>;
  /** Extra NORIX-side configuration to merge onto the integration row. */
  extraConfiguration?: Record<string, unknown>;
}

export async function connectViaNango(input: ConnectViaNangoInput) {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenant = await resolveTenant(input.tenantSlugOrId);

  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, input.integrationId),
      eq(integrations.tenantId, tenant.id),
    ),
  });
  if (!existing) throw new Error("Integration not found");

  // Stable per-tenant/provider connection id so reconnect overwrites cleanly.
  const connectionId = `${tenant.id}--${input.providerConfigKey}`;

  try {
    await createConnectionWithCredentials({
      connectionId,
      providerConfigKey: input.providerConfigKey,
      credentials: input.credentials,
      connectionConfig: input.connectionConfig,
      metadata: { tenantId: tenant.id, integrationId: input.integrationId },
    });
  } catch (error) {
    const message =
      error instanceof NangoError
        ? `Nango rejected the credentials: ${error.message}`
        : "Failed to store credentials in Nango";
    throw new Error(message);
  }

  const [row] = await db
    .update(integrations)
    .set({
      nangoConnectionId: connectionId,
      nangoProviderConfigKey: input.providerConfigKey,
      configuration: {
        ...((existing.configuration as Record<string, unknown>) ?? {}),
        ...(input.extraConfiguration ?? {}),
        authentication: "nango",
      },
      credentialsEncrypted: null,
      isCredentialsAdded: true,
      isEnabled: true,
      syncStatus: "pending",
      errorMessage: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, input.integrationId))
    .returning();

  await createAuditEvent({
    tenantId: tenant.id,
    actorUserId: userId,
    action: "integration.nango_connected",
    targetType: "integration",
    targetId: input.integrationId,
    metadata: { providerConfigKey: input.providerConfigKey },
  });

  return { integration: row, connectionId };
}

/**
 * Merge non-secret settings onto an integration's `configuration` before the
 * hosted Nango Connect popup opens (e.g. a Databricks workspace URL the Proxy
 * needs as its base URL). Does NOT flip `isCredentialsAdded` — the Nango webhook
 * marks the row connected once the user finishes authorizing.
 */
export async function saveNangoConnectionConfig(input: {
  tenantSlugOrId: string;
  integrationId: string;
  configuration: Record<string, unknown>;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const tenant = await resolveTenant(input.tenantSlugOrId);
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, input.integrationId),
      eq(integrations.tenantId, tenant.id),
    ),
  });
  if (!existing) throw new Error("Integration not found");
  await db
    .update(integrations)
    .set({
      configuration: {
        ...((existing.configuration as Record<string, unknown>) ?? {}),
        ...input.configuration,
      },
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, input.integrationId));
}

export async function disconnectNango(input: {
  tenantSlugOrId: string;
  integrationId: string;
}) {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const tenant = await resolveTenant(input.tenantSlugOrId);
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, input.integrationId),
      eq(integrations.tenantId, tenant.id),
    ),
  });
  if (!existing) throw new Error("Integration not found");

  if (existing.nangoConnectionId && existing.nangoProviderConfigKey) {
    try {
      await deleteConnection(
        existing.nangoConnectionId,
        existing.nangoProviderConfigKey,
      );
    } catch (error) {
      console.error("Failed to delete Nango connection:", error);
    }
  }

  const [row] = await db
    .update(integrations)
    .set({
      nangoConnectionId: null,
      nangoProviderConfigKey: null,
      isCredentialsAdded: false,
      isEnabled: false,
      syncStatus: null,
      errorMessage: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, input.integrationId))
    .returning();
  return { integration: row };
}
