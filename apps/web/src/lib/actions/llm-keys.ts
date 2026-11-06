"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db, tenantLlmKeys, tenants } from "@db";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { createAuditEvent } from "@/lib/server/audit";
import { getLlmProvider } from "@/lib/llm-providers";
import { getModelProviderAdapter } from "@/lib/server/model-registry/providers";

async function resolveAuthorizedTenant(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db.select().from(tenants).where(eq(tenants.id, slugOrId)).limit(1);
  if (!rows.length)
    rows = await db.select().from(tenants).where(eq(tenants.slug, slugOrId)).limit(1);
  if (!rows.length || rows[0].id !== orgId) throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

function assertProviderModel(provider: string, modelId: string) {
  const info = getLlmProvider(provider);
  if (!info) throw new Error("Unknown provider");
  // Providers serve far more models than we list, so any plausible model id is accepted;
  // a wrong one is caught by the connection test.
  if (!/^[\w.:/-]{1,200}$/.test(modelId)) throw new Error("Invalid model id");
  return info;
}

/** Saved keys, masked: the plaintext never leaves the server. */
export async function listLlmKeys(tenantSlugOrId: string) {
  const { tenantId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const rows = await db
    .select({
      provider: tenantLlmKeys.provider,
      modelId: tenantLlmKeys.modelId,
      keyLast4: tenantLlmKeys.keyLast4,
      updatedAt: tenantLlmKeys.updatedAt,
    })
    .from(tenantLlmKeys)
    .where(eq(tenantLlmKeys.tenantId, tenantId));
  return rows;
}

/**
 * Rejections the admin can act on are RETURNED, not thrown: in production Next hides the
 * message of a thrown server-action error behind "An error occurred in the Server Components render".
 */
const rejected = (error: string) => ({ success: false as const, error });

export async function saveLlmKey(
  tenantSlugOrId: string,
  provider: string,
  modelId: string,
  apiKey: string,
) {
  const info = getLlmProvider(provider);
  if (!info) return rejected("Unknown provider");
  if (!/^[\w.:/-]{1,200}$/.test(modelId)) return rejected("Invalid model id");
  const key = apiKey.trim();
  if (key.length < 8 || key.length > 512) return rejected("Invalid API key");
  const { tenantId, userId } = await resolveAuthorizedTenant(tenantSlugOrId);

  // The key is always saved; the card then shows whether the provider accepts it (testLlmKey).

  const values = {
    keyEncrypted: encryptSecret(key),
    keyLast4: key.slice(-4),
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  };
  // One key per tenant: saving replaces whatever key was there before.
  await db.transaction(async (tx) => {
    await tx.delete(tenantLlmKeys).where(eq(tenantLlmKeys.tenantId, tenantId));
    await tx.insert(tenantLlmKeys).values({ tenantId, provider, modelId, ...values });
  });
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "llm_key.saved",
    targetType: "llm_provider",
    targetId: `${provider}/${modelId}`,
  });
  return { success: true as const };
}

export async function deleteLlmKey(
  tenantSlugOrId: string,
  provider: string,
  modelId: string,
) {
  assertProviderModel(provider, modelId);
  const { tenantId, userId } = await resolveAuthorizedTenant(tenantSlugOrId);
  await db
    .delete(tenantLlmKeys)
    .where(
      and(
        eq(tenantLlmKeys.tenantId, tenantId),
        eq(tenantLlmKeys.provider, provider),
        eq(tenantLlmKeys.modelId, modelId),
      ),
    );
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "llm_key.deleted",
    targetType: "llm_provider",
    targetId: `${provider}/${modelId}`,
  });
  return { success: true };
}

export async function testLlmKey(
  tenantSlugOrId: string,
  provider: string,
  modelId: string,
) {
  const info = assertProviderModel(provider, modelId);
  const { tenantId } = await resolveAuthorizedTenant(tenantSlugOrId);
  const [row] = await db
    .select({ keyEncrypted: tenantLlmKeys.keyEncrypted })
    .from(tenantLlmKeys)
    .where(
      and(
        eq(tenantLlmKeys.tenantId, tenantId),
        eq(tenantLlmKeys.provider, provider),
        eq(tenantLlmKeys.modelId, modelId),
      ),
    )
    .limit(1);
  // Don't let openai/gemini silently fall back to the server env key here.
  if (!row)
    return { status: "error" as const, code: "missing_api_key", message: "No key saved." };
  return getModelProviderAdapter(provider).testConnection(
    modelId,
    info.baseUrl,
    decryptSecret(row.keyEncrypted),
  );
}

/** Full live OpenRouter catalogue (public endpoint, no key needed). */
export async function getOpenRouterModels() {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error("Could not load OpenRouter models");
  const { data } = (await res.json()) as {
    data: { id: string; name?: string }[];
  };
  return data
    .map((m) => ({ id: m.id, label: m.name || m.id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
