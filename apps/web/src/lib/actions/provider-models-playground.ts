"use server";

import { getProviderModels } from "@/lib/queries/provider-models";

// Providers the Playground can actually execute end-to-end today.
// The ControlNet gateway uses a single OpenAI-wire client (Bearer auth +
// `${base_url}/chat/completions`) and injects OPENAI_API_KEY for every provider
// (apps/controlnet/cga_core/pipeline_fns.py), so only OpenAI models succeed.
// Anthropic/Gemini/etc. resolve a URL but fail at the provider call.
// Expand this set ONLY when provider-aware keys + adapters land — see
// docs/superpowers/specs/2026-05-28-playground-model-url-rca-design.md §9.
const PLAYGROUND_SUPPORTED_PROVIDERS = new Set(["openai"]);

export async function getProviderModelsForPlayground(tenantId: string) {
  if (!tenantId) {
    return {
      status: false,
      message: "Tenant ID is required",
      models: [],
    };
  }

  try {
    const models = await getProviderModels(tenantId);
    
    const availableModels = models
      .filter(
        (model) =>
          model.availabilityStatus === "available" &&
          model.modelUrl != null &&
          model.modelUrl !== "" &&
          PLAYGROUND_SUPPORTED_PROVIDERS.has(model.provider)
      )
      .map((model) => ({
        id: model.id,
        modelId: model.modelId,
        displayName: model.displayName || model.modelId,
        provider: model.provider,
      }))
      .sort((a, b) => {
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.displayName.localeCompare(b.displayName);
      });

    return {
      status: true,
      models: availableModels,
      message: `Found ${availableModels.length} available models`,
    };
  } catch (error) {
    console.error("Failed to fetch provider models:", error);
    return {
      status: false,
      message: "Failed to fetch models",
      models: [],
    };
  }
}

