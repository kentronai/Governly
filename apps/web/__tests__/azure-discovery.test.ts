import { correlateAzureResources, normalizeAzureResources } from "@/lib/server/azure/resource-normalizer";

describe("Azure Resource Graph discovery", () => {
  it("normalizes every supported Azure resource and excludes non-OpenAI cognitive accounts", async () => {
    const resources = [
      ["openai", "microsoft.cognitiveservices/accounts", "OpenAI"],
      ["foundry", "microsoft.machinelearningservices/workspaces", "Hub"],
      ["agent-function", "microsoft.web/sites", "functionapp,linux"],
      ["agent-logic", "microsoft.logic/workflows", ""],
      ["identity", "microsoft.managedidentity/userassignedidentities", ""],
      ["storage", "microsoft.storage/storageaccounts", ""],
      ["vault", "microsoft.keyvault/vaults", ""],
      ["apim", "microsoft.apimanagement/service", ""],
      ["speech", "microsoft.cognitiveservices/accounts", "SpeechServices"],
    ].map(([name, type, kind]) => ({ id: `/subscriptions/sub/resourceGroups/ai/providers/${type}/${name}`, name, type, kind, location: "eastus", resourceGroup: "ai", tags: { Owner: "owner@example.com" }, properties: { publicNetworkAccess: "Disabled" } }));
    const result = normalizeAzureResources(resources);

    expect(result).toHaveLength(8);
    expect(new Set(result.map((item) => item.resourceType))).toEqual(new Set([
      "azure_openai_account", "azure_ai_foundry_project", "azure_function", "azure_logic_app",
      "azure_managed_identity", "azure_storage_account", "azure_key_vault", "azure_api_management",
    ]));
    expect(result.find((item) => item.resourceType === "azure_function")?.metadata.hasWrite).toBe(true);
  });

  it("rejects ordinary web apps so they are not mislabeled as agents", () => {
    expect(normalizeAzureResources([{ id: "/web", name: "web", type: "microsoft.web/sites", kind: "app", location: "eastus" }])).toEqual([]);
  });

  it("correlates agent anchors with supporting resources only from the same resource group", () => {
    const resources = normalizeAzureResources([
      { id: "/openai", name: "openai", type: "microsoft.cognitiveservices/accounts", kind: "OpenAI", location: "eastus", resourceGroup: "ai", properties: {} },
      { id: "/vault-ai", name: "vault-ai", type: "microsoft.keyvault/vaults", location: "eastus", resourceGroup: "ai", properties: {} },
      { id: "/vault-other", name: "vault-other", type: "microsoft.keyvault/vaults", location: "eastus", resourceGroup: "other", properties: {} },
    ]);
    const [agent] = correlateAzureResources(resources);
    expect(agent.platform).toBe("azure_openai");
    expect(agent.resources.map((item) => item.resourceId)).toEqual(["/openai", "/vault-ai"]);
  });
});
