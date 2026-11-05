"use server";

import { db } from "@db";
import { providerModelMetadata, providerModels } from "@db";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

export async function getModelsByProvider(provider: string) {
  try {
    if (!provider) {
      return {
        status: false,
        message: "Provider is required",
        models: [],
      };
    }

    const models = await db
      .select({
        id: providerModelMetadata.id,
        provider: providerModelMetadata.provider,
        modelId: providerModelMetadata.modelId, // API identifier for auto-fill (may be null if not migrated)
        displayName: providerModelMetadata.displayName,
        contextWindow: providerModelMetadata.contextWindow,
        inputCost: providerModelMetadata.inputCost,
        outputCost: providerModelMetadata.outputCost,
      })
      .from(providerModelMetadata)
      //   @ts-ignore
      .where(eq(providerModelMetadata.provider, provider))
      .orderBy(providerModelMetadata.displayName);

    // Ensure all values are non-null for React controlled inputs
    const sanitizedModels = models.map((m) => ({
      ...m,
      modelId: m.modelId ?? "",
      contextWindow: m.contextWindow ?? "",
      inputCost: m.inputCost ?? "",
      outputCost: m.outputCost ?? "",
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
 * global ones), minus deprecated. Used to restrict model pickers in applications.
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
        ne(providerModels.availabilityStatus, "deprecated"),
      ),
    )
    .orderBy(providerModels.displayName);

  return {
    status: true,
    models: rows.map((m) => ({ id: m.id, displayName: m.displayName || m.modelId })),
  };
}
