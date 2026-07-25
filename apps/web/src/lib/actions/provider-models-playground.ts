"use server";

import { auth } from "@clerk/nextjs/server";
import { getModelRegistryRuntime } from "@/lib/server/model-registry/runtime";
import { isExecutableModelProvider } from "@/lib/server/model-registry/providers";

export async function getProviderModelsForPlayground() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) {
    return { status: false, message: "Authentication required", models: [] };
  }

  try {
    const models = await getModelRegistryRuntime(orgId);

    const availableModels = models
      .filter(
        (model) =>
          model.availabilityStatus === "available" &&
          model.modelUrl != null &&
          model.modelUrl !== "" &&
          isExecutableModelProvider(model.provider),
      )
      .map((model) => ({
        id: model.id,
        modelId: model.modelId,
        displayName: model.displayName || model.modelId,
        provider: model.provider,
        isSelected: model.isSelected === true,
        connectionStatus: model.connectionStatus || "not_tested",
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
      selectedModelId:
        availableModels.find((model) => model.isSelected)?.modelId ?? null,
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
