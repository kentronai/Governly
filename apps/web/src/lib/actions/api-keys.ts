/**
 * Server actions for API Keys
 */

"use server";

import { db, apiKeys } from "@db";
import { and, eq } from "drizzle-orm";
import {
  requireActiveTenant,
  requireTenantMember,
} from "@/lib/server/tenant-access";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { createAuditEvent } from "@/lib/server/audit";

interface CreateApiKeyInput {
  tenantId: string;
  name: string;
  permissions?: string[];
  rateLimitPerMinute?: number;
  expiresAt?: string;
}

// Generate a secure API key
function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomBytes = crypto.randomBytes(32);
  const key = `sk_live_${randomBytes.toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 12); // First 12 chars for display

  return { key, hash, prefix };
}

export const createApiKey = async (input: CreateApiKeyInput) => {
  const { userId, tenantId } = await requireTenantMember(input.tenantId);

  const { key, hash, prefix } = generateApiKey();

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      tenantId,
      name: input.name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: input.permissions || [],
      rateLimitPerMinute: input.rateLimitPerMinute || 1000,
      expiresAt: input.expiresAt || null,
      isActive: true,
      createdBy: userId,
    })
    .returning();

  revalidatePath("/[tenant]/api-keys", "page");

  try {
    await createAuditEvent({
      tenantId,
      actorUserId: userId,
      action: "api_key.created",
      targetType: "api_key",
      targetId: apiKey.id,
      metadata: { name: input.name, permissions: input.permissions },
    });
  } catch (e) {
    console.error("Failed to write audit event (api_key.created):", e);
  }

  // Return the plain key ONLY on creation (never shown again)
  return {
    ...apiKey,
    plainKey: key, // ⚠️ Show this to user immediately, never stored
  };
};

export const revokeApiKey = async (keyId: string) => {
  const { userId, tenantId } = await requireActiveTenant();

  const [apiKey] = await db
    .update(apiKeys)
    .set({
      isActive: false,
      revokedBy: userId,
      revokedAt: new Date().toISOString(),
    })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))
    .returning();

  if (!apiKey) {
    throw new Error("API key not found");
  }

  revalidatePath("/[tenant]/api-keys", "page");

  try {
    await createAuditEvent({
      tenantId: apiKey.tenantId,
      actorUserId: userId,
      action: "api_key.revoked",
      targetType: "api_key",
      targetId: apiKey.id,
    });
  } catch (e) {
    console.error("Failed to write audit event (api_key.revoked):", e);
  }

  return apiKey;
};

export const deleteApiKey = async (keyId: string) => {
  const { userId, tenantId } = await requireActiveTenant();

  const [apiKey] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))
    .returning();

  if (!apiKey) {
    throw new Error("API key not found");
  }

  revalidatePath("/[tenant]/api-keys", "page");

  try {
    await createAuditEvent({
      tenantId: apiKey.tenantId,
      actorUserId: userId,
      action: "api_key.deleted",
      targetType: "api_key",
      targetId: apiKey.id,
    });
  } catch (e) {
    console.error("Failed to write audit event (api_key.deleted):", e);
  }

  return { success: true };
};

export const updateApiKey = async (
  keyId: string,
  input: Partial<CreateApiKeyInput>,
) => {
  const { userId, tenantId } = await requireActiveTenant();

  const [apiKey] = await db
    .update(apiKeys)
    .set({
      name: input.name,
      permissions: input.permissions,
      rateLimitPerMinute: input.rateLimitPerMinute,
      expiresAt: input.expiresAt,
    })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))
    .returning();

  if (!apiKey) {
    throw new Error("API key not found");
  }

  revalidatePath("/[tenant]/api-keys", "page");

  try {
    await createAuditEvent({
      tenantId: apiKey.tenantId,
      actorUserId: userId,
      action: "api_key.updated",
      targetType: "api_key",
      targetId: apiKey.id,
      metadata: { update: input },
    });
  } catch (e) {
    console.error("Failed to write audit event (api_key.updated):", e);
  }

  return apiKey;
};
