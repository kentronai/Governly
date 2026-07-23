import type {
  DiscoveredResourceType,
  RawDiscoveredResource,
} from "@/lib/server/aws/discovery/types";
import type { CorrelatedAgent } from "@/lib/server/aws/correlation";

export type AzureGraphResource = {
  id: string;
  name: string;
  type: string;
  kind?: string;
  location?: string;
  resourceGroup?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
};

const TYPE_MAP: Record<string, DiscoveredResourceType> = {
  "microsoft.machinelearningservices/workspaces": "azure_ai_foundry_project",
  "microsoft.logic/workflows": "azure_logic_app",
  "microsoft.managedidentity/userassignedidentities": "azure_managed_identity",
  "microsoft.storage/storageaccounts": "azure_storage_account",
  "microsoft.keyvault/vaults": "azure_key_vault",
  "microsoft.apimanagement/service": "azure_api_management",
  "microsoft.compute/virtualmachines": "azure_virtual_machine",
  "microsoft.app/containerapps": "azure_container_app",
  "microsoft.containerservice/managedclusters": "azure_aks_cluster",
};

const AI_SIGNAL =
  /(^|[-_:/.])(ai|agent|llm|genai|copilot|assistant|langchain|crewai|autogen)([-_:/.]|$)/i;
const COMPUTE_TYPES = new Set<DiscoveredResourceType>([
  "azure_virtual_machine",
  "azure_container_app",
  "azure_aks_cluster",
]);
const SIGNAL_REQUIRED_TYPES = new Set<DiscoveredResourceType>([
  ...COMPUTE_TYPES,
  "azure_function",
  "azure_logic_app",
]);

function hasAgentSignal(resource: AzureGraphResource): boolean {
  if (AI_SIGNAL.test(resource.name)) return true;
  return Object.entries(resource.tags ?? {}).some(
    ([key, value]) =>
      (AI_SIGNAL.test(key) ||
        ["ai", "ai-agent", "agent", "norix:agent"].includes(
          key.toLowerCase(),
        )) &&
      String(value).toLowerCase() !== "false" &&
      String(value).toLowerCase() !== "disabled",
  );
}

export function normalizeAzureResources(
  data: AzureGraphResource[],
): RawDiscoveredResource[] {
  return data.flatMap((resource): RawDiscoveredResource[] => {
    const type = resource.type.toLowerCase();
    const kind = (resource.kind ?? "").toLowerCase();
    let resourceType = TYPE_MAP[type];
    if (type === "microsoft.cognitiveservices/accounts") {
      if (!kind.includes("openai")) return [];
      resourceType = "azure_openai_account";
    }
    if (type === "microsoft.web/sites") {
      if (!kind.includes("functionapp")) return [];
      resourceType = "azure_function";
    }
    if (!resourceType) return [];
    // A cloud inventory entry does not prove that arbitrary VM/container code
    // is an agent. Require explicit, inspectable metadata for compute anchors.
    if (SIGNAL_REQUIRED_TYPES.has(resourceType) && !hasAgentSignal(resource))
      return [];
    const properties = resource.properties ?? {};
    return [
      {
        resourceType,
        resourceId: resource.id,
        resourceArn: resource.id,
        resourceName: resource.name,
        region: resource.location ?? "global",
        tags: resource.tags ?? {},
        lastUpdatedAt:
          typeof properties.changedTime === "string"
            ? properties.changedTime
            : null,
        metadata: {
          ...properties,
          azureType: resource.type,
          kind: resource.kind ?? null,
          resourceGroup: resource.resourceGroup ?? null,
          publicNetworkAccess: properties.publicNetworkAccess ?? null,
          hasWrite:
            resourceType === "azure_function" ||
            resourceType === "azure_logic_app" ||
            COMPUTE_TYPES.has(resourceType),
          discoveryQualification: SIGNAL_REQUIRED_TYPES.has(resourceType)
            ? "Name or tags explicitly identify this workload as an AI agent."
            : "Native Azure AI/serverless resource.",
        },
      },
    ];
  });
}

export function correlateAzureResources(
  resources: RawDiscoveredResource[],
): CorrelatedAgent[] {
  const anchors = new Set<DiscoveredResourceType>([
    "azure_openai_account",
    "azure_ai_foundry_project",
    "azure_function",
    "azure_logic_app",
    "azure_virtual_machine",
    "azure_container_app",
    "azure_aks_cluster",
  ]);
  const platform: Record<string, CorrelatedAgent["platform"]> = {
    azure_openai_account: "azure_openai",
    azure_ai_foundry_project: "azure_ai_foundry",
    azure_function: "azure_functions",
    azure_logic_app: "azure_logic_apps",
    azure_virtual_machine: "azure_virtual_machines",
    azure_container_app: "azure_container_apps",
    azure_aks_cluster: "azure_aks",
  };
  return resources
    .filter((resource) => anchors.has(resource.resourceType))
    .map((anchor) => {
      const group = anchor.metadata.resourceGroup;
      const related = resources.filter(
        (resource) =>
          resource === anchor ||
          (group &&
            resource.metadata.resourceGroup === group &&
            !anchors.has(resource.resourceType)),
      );
      return {
        externalAgentId: anchor.resourceId,
        name: anchor.resourceName,
        platform: platform[anchor.resourceType] ?? "other",
        region: anchor.region,
        discoverySource: anchor.resourceType,
        resources: related,
      };
    });
}
