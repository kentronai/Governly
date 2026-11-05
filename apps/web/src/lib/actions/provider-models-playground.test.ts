/** @jest-environment node */

jest.mock("@clerk/nextjs/server", () => ({
  auth: jest.fn(),
}));
jest.mock("@/lib/server/model-registry/runtime", () => ({
  getModelRegistryRuntime: jest.fn(),
}));
jest.mock("@/lib/server/model-registry/providers", () => ({
  isExecutableModelProvider: (provider: string) =>
    provider === "openai" || provider === "gemini",
}));

import { auth } from "@clerk/nextjs/server";
import { getModelRegistryRuntime } from "@/lib/server/model-registry/runtime";
import { getProviderModelsForPlayground } from "./provider-models-playground";

const mockedAuth = auth as unknown as jest.Mock;
const mockedRuntime = getModelRegistryRuntime as jest.Mock;

describe("getProviderModelsForPlayground", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires an authenticated organization and ignores caller tenant input", async () => {
    mockedAuth.mockResolvedValue({ userId: null, orgId: null });

    await expect(getProviderModelsForPlayground()).resolves.toEqual({
      status: false,
      message: "Authentication required",
      models: [],
    });
    expect(mockedRuntime).not.toHaveBeenCalled();
  });

  it("returns only executable available models and the persistent selection", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    mockedRuntime.mockResolvedValue([
      {
        id: "gemini-1",
        modelId: "gemini-3.6-flash",
        displayName: "Google Gemini 3.6 Flash",
        provider: "gemini",
        availabilityStatus: "available",
        modelUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        isSelected: true,
        connectionStatus: "ready",
      },
      {
        id: "openai-2",
        modelId: "gpt-z",
        displayName: "Zulu",
        provider: "openai",
        availabilityStatus: "available",
        modelUrl: "https://api.openai.com/v1",
        isSelected: false,
        connectionStatus: null,
      },
      {
        id: "openai-1",
        modelId: "gpt-a",
        displayName: "Alpha",
        provider: "openai",
        availabilityStatus: "available",
        modelUrl: "https://api.openai.com/v1",
        isSelected: false,
        connectionStatus: "not_tested",
      },
      {
        id: "anthropic-1",
        modelId: "claude",
        displayName: "Claude",
        provider: "anthropic",
        availabilityStatus: "available",
        modelUrl: "https://api.anthropic.com",
      },
      {
        id: "disabled-1",
        modelId: "disabled",
        displayName: "Disabled",
        provider: "openai",
        availabilityStatus: "deprecated",
        modelUrl: "https://api.openai.com/v1",
      },
    ]);

    const result = await getProviderModelsForPlayground();

    expect(mockedRuntime).toHaveBeenCalledWith("org_1");
    expect(result.status).toBe(true);
    expect(result.selectedModelId).toBe("gemini-3.6-flash");
    expect(result.models.map((model) => model.modelId)).toEqual([
      "gemini-3.6-flash",
      "gpt-a",
      "gpt-z",
    ]);
    expect(result.models[0].connectionStatus).toBe("ready");
    expect(result.models[1].connectionStatus).toBe("not_tested");
  });

  it("returns a safe failure when the registry cannot be loaded", async () => {
    mockedAuth.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    mockedRuntime.mockRejectedValue(new Error("database connection details"));

    await expect(getProviderModelsForPlayground()).resolves.toEqual({
      status: false,
      message: "Failed to fetch models",
      models: [],
    });
  });
});
