export type DiscoveredResourceType =
  | "bedrock_agent"
  | "agentcore_runtime"
  | "bedrock_agent_alias"
  | "knowledge_base"
  | "guardrail"
  | "prompt"
  | "lambda_function"
  | "step_function"
  | "cloudwatch_log_group"
  | "iam_role"
  | "secrets_manager_secret"
  | "api_gateway_api"
  | "eventbridge_rule"
  | "ec2_instance"
  | "aws_eks_cluster"
  | "azure_openai_account"
  | "azure_ai_foundry_project"
  | "azure_function"
  | "azure_logic_app"
  | "azure_managed_identity"
  | "azure_storage_account"
  | "azure_key_vault"
  | "azure_api_management"
  | "azure_virtual_machine"
  | "azure_container_app"
  | "azure_aks_cluster"
  | "gcp_vertex_reasoning_engine"
  | "gcp_cloud_run_service"
  | "gcp_compute_instance"
  | "gcp_gke_cluster"
  | "gcp_cloud_function"
  | "databricks_serving_endpoint"
  | "databricks_registered_model"
  | "databricks_catalog"
  | "databricks_schema"
  | "databricks_table"
  | "databricks_app"
  | "databricks_job"
  | "databricks_notebook"
  | "databricks_genie_space"
  | "kubernetes_workload"
  | "crewai_deployment"
  | "crewai_crew"
  | "crewai_agent"
  | "crewai_task"
  | "github_repository";

export interface RawDiscoveredResource {
  resourceType: DiscoveredResourceType;
  resourceId: string;
  resourceArn: string | null;
  resourceName: string;
  region: string;
  tags: Record<string, string>;
  // Anchoring hints used by the correlation engine to link resources
  // together without a live API round-trip per pair.
  linkedRoleArn?: string | null;
  linkedFunctionArns?: string[];
  linkedFunctionNames?: string[];
  createdAt?: string | null;
  lastUpdatedAt?: string | null;
  metadata: Record<string, unknown>;
}

// ponytail: per-list cap of 1000 items so a huge account can't stall a scan;
// raise it (or stream) if a real account outgrows it.
export const MAX_LIST_ITEMS = 1000;

const STABLE_ERROR =
  /AccessDenied|UnauthorizedOperation|UnauthorizedAccess|not authorized|NotFound|NoSuchEntity/i;

/**
 * Records a swallowed (best-effort) lookup failure as a scan warning, so the
 * scan counts as partial and no agent is retired because of it. Denied and
 * not-found are stable answers (the same on every scan), so they stay silent.
 */
export function noteLookupFailure(
  clients: { region: string; warnings?: string[] },
  what: string,
  error: unknown,
): void {
  const e = error as { name?: string; message?: string } | undefined;
  if (STABLE_ERROR.test(`${e?.name ?? ""} ${e?.message ?? ""}`)) return;
  clients.warnings?.push(`${clients.region} ${what}: ${e?.message ?? String(error)}`);
}

/** Drains an AWS SDK paginator (or any page iterator) up to MAX_LIST_ITEMS. */
export async function collectPages<P, T>(
  pages: AsyncIterable<P>,
  pick: (page: P) => T[] | undefined,
): Promise<T[]> {
  const out: T[] = [];
  for await (const page of pages) {
    out.push(...(pick(page) ?? []));
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}
