"use server";

import { db } from "@db";
import { providerModels } from "@db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { getLlmProvider, getModelProvider } from "@/lib/llm-providers";
import { radarModelCandidates } from "@/lib/server/radar/llm";

const NON_CHAT = /embed|whisper|tts|dall-e|moderation|transcribe|image|audio|realtime|rerank/i;

/** Every model the provider's own API lists for the workspace's BYOK / server key; [] if no key or the call fails. */
async function fetchLiveModelIds(provider: string, orgId?: string | null): Promise<string[]> {
  const info = getLlmProvider(provider);
  if (!info) return [];
  try {
    const cand = (await radarModelCandidates(orgId ?? undefined)).find((c) => c.provider === provider);
    if (!cand) return [];
    const res = await fetch(`${info.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${cand.apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const { data } = (await res.json()) as { data?: { id?: string }[] };
    return (data ?? []).map((m) => (m.id ?? "").replace(/^models\//, "")).filter((id) => id && !NON_CHAT.test(id));
  } catch {
    return [];
  }
}

// A registry model is "approved" (selectable in applications) unless it is deprecated/unavailable.
const APPROVED_STATUSES: ("available" | "preview")[] = ["available", "preview"];

export async function getModelsByProvider(provider: string) {
  try {
    if (!provider) {
      return {
        status: false,
        message: "Provider is required",
        models: [],
      };
    }

    // One catalog for every picker (BYOK, Model Registry, Applications): see lib/llm-providers.
    const base = getModelProvider(provider)?.models ?? [];
    const { orgId } = await auth();
    const known = new Set(base.map((m) => m.id));
    const live = (await fetchLiveModelIds(provider, orgId))
      .filter((id) => !known.has(id))
      .sort()
      .map((id) => ({ id, label: id }));
    const sanitizedModels = [...base, ...live].map((m) => ({
      id: m.id,
      provider,
      modelId: m.id,
      displayName: m.label,
      contextWindow: "",
      inputCost: "",
      outputCost: "",
    }));

    return {
      status: true,
      models: sanitizedModels,
      message: `Found ${sanitizedModels.length} models for ${provider}`,
    };
  } catch (error) {
    console.error("Failed to fetch models by provider:", error);
    return {
      status: false,
      message: "Failed to fetch models",
      models: [],
    };
  }
}

/**
 * Models the tenant has approved in the Model Registry (its own entries plus
 * global ones), available or preview only. Used to restrict model pickers in applications.
 */
export async function getApprovedModelsByProvider(provider: string) {
  const { orgId } = await auth();
  if (!orgId || !provider) return { status: false, models: [] };

  const rows = await db
    .select({
      id: providerModels.id,
      modelId: providerModels.modelId,
      displayName: providerModels.displayName,
    })
    .from(providerModels)
    .where(
      and(
        // @ts-ignore provider is an enum column
        eq(providerModels.provider, provider),
        or(eq(providerModels.tenantId, orgId), isNull(providerModels.tenantId)),
        inArray(providerModels.availabilityStatus, APPROVED_STATUSES),
      ),
    )
    .orderBy(providerModels.displayName);

  return {
    status: true,
    models: rows.map((m) => ({ id: m.id, displayName: m.displayName || m.modelId })),
  };
}

/** Providers that have at least one approved (non-deprecated) model in the tenant's registry. */
export async function getApprovedProviders() {
  const { orgId } = await auth();
  if (!orgId) return [] as string[];

  const rows = await db
    .selectDistinct({ provider: providerModels.provider })
    .from(providerModels)
    .where(
      and(
        or(eq(providerModels.tenantId, orgId), isNull(providerModels.tenantId)),
        inArray(providerModels.availabilityStatus, APPROVED_STATUSES),
      ),
    );
  return rows.map((r) => r.provider as string);
}
