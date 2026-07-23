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
  | "databricks_genie_space";

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
