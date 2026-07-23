/**
 * Server actions for Integrations
 */

"use server";

import { db, integrations, tenants } from "@db";
import { eq, and } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";

export interface CreateIntegrationInput {
  tenantSlug: string;
  name: string;
  category: string;
  description?: string;
  logoUrl?: string;
  configuration?: Record<string, unknown>;
}

export interface UpdateIntegrationInput {
  tenantSlug: string;
  id: string;
  isEnabled?: boolean;
  isCredentialsAdded?: boolean;
  configuration?: Record<string, unknown>;
  apiKey?: string;
  name?: string;
  description?: string;
  logoUrl?: string;
}

export const getIntegrations = async (tenantSlugOrId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first (in case tenantSlugOrId is actually an ID), then by slug
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

  const integrationsList = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId))
    .orderBy(integrations.name);

  return { integrations: integrationsList };
};

export const createIntegration = async (input: CreateIntegrationInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, input.tenantSlug))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const tenantId = tenantRow[0].id;

  if (!input.name || !input.category) {
    throw new Error("Name and category are required");
  }

  const newIntegration = await db
    .insert(integrations)
    .values({
      tenantId,
      name: input.name,
      category: input.category,
      description: input.description,
      configuration: input.configuration || {},
      metadata: input.logoUrl ? { logoUrl: input.logoUrl } : {},
      isEnabled: false,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "integration.created",
      targetType: "integration",
      targetId: newIntegration[0].id,
      metadata: { name: input.name, category: input.category },
    });
  } catch (e) {
    console.error("Failed to write audit event (integration.created):", e);
  }

  return { integration: newIntegration[0] };
};

export const updateIntegration = async (input: UpdateIntegrationInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first, then by slug
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, input.tenantSlug))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const tenantId = tenantRow[0].id;

  const updateData: any = {
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  };

  if (input.isEnabled !== undefined) updateData.isEnabled = input.isEnabled;
  if (input.isCredentialsAdded !== undefined)
    updateData.isCredentialsAdded = input.isCredentialsAdded;
  if (input.configuration !== undefined)
    updateData.configuration = input.configuration;
  if (input.apiKey !== undefined)
    updateData.credentialsEncrypted = input.apiKey;
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined)
    updateData.description = input.description;
  if (input.logoUrl !== undefined)
    updateData.metadata = { logoUrl: input.logoUrl };

  const updatedIntegration = await db
    .update(integrations)
    .set(updateData)
    .where(
      and(eq(integrations.id, input.id), eq(integrations.tenantId, tenantId)),
    )
    .returning();

  if (updatedIntegration.length === 0) {
    throw new Error("Integration not found");
  }

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "integration.updated",
      targetType: "integration",
      targetId: input.id,
      metadata: { update: input },
    });
  } catch (e) {
    console.error("Failed to write audit event (integration.updated):", e);
  }

  return { integration: updatedIntegration[0] };
};

export const saveEncryptedIntegrationCredentials = async (input: {
  tenantSlug: string;
  id: string;
  credentials: Record<string, unknown>;
}) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, input.tenantSlug))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, input.tenantSlug))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  const [integration] = await db
    .update(integrations)
    .set({
      credentialsEncrypted: encryptSecret(JSON.stringify(input.credentials)),
      configuration: { credentialFields: Object.keys(input.credentials) },
      isCredentialsAdded: true,
      isEnabled: true,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(integrations.id, input.id),
        eq(integrations.tenantId, tenantRow[0].id),
      ),
    )
    .returning();
  if (!integration) throw new Error("Integration not found");
  await createAuditEvent({
    tenantId: tenantRow[0].id,
    actorUserId: userId,
    action: "integration.credentials_saved",
    targetType: "integration",
    targetId: input.id,
    metadata: { credentialFields: Object.keys(input.credentials) },
  });
  return { integration };
};

export const clearIntegrationCredentials = async (
  tenantSlugOrId: string,
  id: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
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
  const [integration] = await db
    .update(integrations)
    .set({
      credentialsEncrypted: null,
      configuration: {},
      isCredentialsAdded: false,
      isEnabled: false,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(eq(integrations.id, id), eq(integrations.tenantId, tenantRow[0].id)),
    )
    .returning();
  if (!integration) throw new Error("Integration not found");
  return { integration };
};

export const deleteIntegration = async (tenantSlugOrId: string, id: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  // Try to find by ID first, then by slug
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

  const deletedIntegration = await db
    .delete(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)))
    .returning();

  if (deletedIntegration.length === 0) {
    throw new Error("Integration not found");
  }

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "integration.deleted",
      targetType: "integration",
      targetId: id,
    });
  } catch (e) {
    console.error("Failed to write audit event (integration.deleted):", e);
  }

  return { message: "Integration deleted successfully" };
};
