/**
 * Builds the normalized "facts" object that the Autonomy and Risk rule
 * evaluations run against, from a correlated agent's real discovered
 * resources. This is the only place capability facts are derived — the
 * rule engine and its rules never inspect raw AWS resources directly.
 */

import type { CorrelatedAgent } from "../aws/correlation";
import type { Facts } from "./rule-engine";

const DORMANT_AFTER_DAYS = 60;
const CREDENTIAL_STALE_AFTER_DAYS = 90;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

export interface CapabilityFacts extends Facts {
  hasOwner: boolean;
  hasAdminRole: boolean;
  hasWritePermissions: boolean;
  hasDeletePermissions: boolean;
  hasInvokePermissions: boolean;
  hasCrossAccountPermissions: boolean;
  hasGuardrails: boolean;
  hasApprovalWorkflow: boolean;
  isDormant: boolean;
  hasPublicEndpoint: boolean;
  hasSensitiveDataAccess: boolean;
  credentialAgeDays: number | null;
  hasUnusedPermissions: boolean;
  hasExternalApiAccess: boolean;
  hasExecuteCapableResource: boolean;
  isConversationalAgent: boolean;
  resourceCount: number;
}

const EXTERNAL_API_ENV_PATTERN = /API_KEY|API_URL|ENDPOINT|WEBHOOK|TOKEN/i;

export function buildCapabilityFacts(
  agent: CorrelatedAgent,
  ownerUserId: string | null,
): CapabilityFacts {
  const roles = agent.resources.filter((r) => r.resourceType === "iam_role");
  const guardrails = agent.resources.filter(
    (r) => r.resourceType === "guardrail",
  );
  const secrets = agent.resources.filter(
    (r) => r.resourceType === "secrets_manager_secret",
  );
  const apis = agent.resources.filter(
    (r) => r.resourceType === "api_gateway_api",
  );
  const lambdas = agent.resources.filter(
    (r) => r.resourceType === "lambda_function",
  );
  const stepFns = agent.resources.filter(
    (r) => r.resourceType === "step_function",
  );
  const azureIdentities = agent.resources.filter(
    (r) => r.resourceType === "azure_managed_identity",
  );
  const azureExecute = agent.resources.filter(
    (r) =>
      r.resourceType === "azure_function" ||
      r.resourceType === "azure_logic_app",
  );
  const azureApis = agent.resources.filter(
    (r) => r.resourceType === "azure_api_management",
  );
  const azureSensitive = agent.resources.filter(
    (r) =>
      r.resourceType === "azure_key_vault" ||
      r.resourceType === "azure_storage_account",
  );
  const agentCoreRuntimes = agent.resources.filter(
    (r) => r.resourceType === "agentcore_runtime",
  );
  const cloudCompute = agent.resources.filter((r) =>
    [
      "ec2_instance",
      "azure_virtual_machine",
      "azure_container_app",
      "azure_aks_cluster",
      "gcp_cloud_run_service",
      "gcp_compute_instance",
      "gcp_gke_cluster",
      "gcp_cloud_function",
      "gcp_vertex_reasoning_engine",
      "databricks_serving_endpoint",
    ].includes(r.resourceType),
  );

  const hasAdminRole =
    roles.some((r) => Boolean(r.metadata.hasAdminPolicy)) ||
    azureIdentities.some((r) => Boolean(r.metadata.hasAdminRole));
  const hasWritePermissions =
    roles.some((r) => Boolean(r.metadata.hasWrite)) ||
    agent.resources.some((r) => Boolean(r.metadata.hasWrite));
  const hasDeletePermissions = roles.some((r) => Boolean(r.metadata.hasDelete));
  const hasInvokePermissions =
    roles.some((r) => Boolean(r.metadata.hasInvoke)) ||
    azureExecute.length > 0 ||
    cloudCompute.length > 0;
  const hasCrossAccountPermissions = roles.some((r) =>
    Boolean(r.metadata.hasCrossAccountTrust),
  );

  // AWS has no native "approval workflow" concept; this is read from an
  // explicit tag on the anchor resource (e.g. norix:approval-required) since
  // it cannot be derived from IAM/Bedrock metadata alone.
  const hasApprovalWorkflow = agent.resources.some(
    (r) =>
      (
        r.tags["norix:approval-required"] ?? r.tags["approval-required"]
      )?.toLowerCase() === "true",
  );

  const lastActivityDays = Math.min(
    ...roles
      .map((r) => daysSince(r.metadata.lastUsedDate as string | null))
      .filter((d): d is number => d !== null),
    ...agent.resources
      .map((r) => daysSince(r.lastUpdatedAt))
      .filter((d): d is number => d !== null),
    Number.POSITIVE_INFINITY,
  );
  const isDormant =
    Number.isFinite(lastActivityDays) && lastActivityDays > DORMANT_AFTER_DAYS;

  const credentialAges = secrets
    .map((s) =>
      daysSince(
        (s.metadata.lastAccessedDate as string | null) ?? s.lastUpdatedAt,
      ),
    )
    .concat(roles.map((r) => daysSince(r.createdAt)))
    .filter((d): d is number => d !== null);
  const credentialAgeDays =
    credentialAges.length > 0 ? Math.max(...credentialAges) : null;

  const hasUnusedPermissions = roles.some(
    (r) =>
      Number(r.metadata.actionCount ?? 0) > 15 &&
      (!r.metadata.lastUsedDate ||
        (daysSince(r.metadata.lastUsedDate as string) ?? 0) >
          CREDENTIAL_STALE_AFTER_DAYS),
  );

  const hasExternalApiAccess =
    lambdas.some((fn) =>
      ((fn.metadata.environmentKeys as string[]) ?? []).some((key) =>
        EXTERNAL_API_ENV_PATTERN.test(key),
      ),
    ) ||
    agentCoreRuntimes.some((runtime) =>
      ((runtime.metadata.environmentKeys as string[]) ?? []).some((key) =>
        EXTERNAL_API_ENV_PATTERN.test(key),
      ),
    );

  return {
    hasOwner: Boolean(ownerUserId),
    hasAdminRole,
    hasWritePermissions,
    hasDeletePermissions,
    hasInvokePermissions,
    hasCrossAccountPermissions,
    hasGuardrails: guardrails.length > 0,
    hasApprovalWorkflow,
    isDormant,
    hasPublicEndpoint:
      apis.length > 0 ||
      azureApis.length > 0 ||
      agent.resources.some((r) => {
        if (r.metadata.publicNetworkAccess === "Enabled") return true;
        const network = r.metadata.networkConfiguration as {
          networkMode?: string;
        } | null;
        return (
          r.resourceType === "agentcore_runtime" &&
          network?.networkMode === "PUBLIC"
        );
      }),
    hasSensitiveDataAccess: secrets.length > 0 || azureSensitive.length > 0,
    credentialAgeDays,
    hasUnusedPermissions,
    hasExternalApiAccess: hasExternalApiAccess || azureApis.length > 0,
    hasExecuteCapableResource:
      hasInvokePermissions ||
      agentCoreRuntimes.length > 0 ||
      lambdas.length > 0 ||
      stepFns.length > 0 ||
      azureExecute.length > 0 ||
      cloudCompute.length > 0,
    isConversationalAgent: agent.resources.some(
      (r) =>
        r.resourceType === "bedrock_agent" ||
        r.resourceType === "agentcore_runtime" ||
        r.resourceType === "azure_openai_account" ||
        r.resourceType === "azure_ai_foundry_project" ||
        r.resourceType === "gcp_vertex_reasoning_engine" ||
        r.resourceType === "databricks_serving_endpoint" ||
        r.resourceType === "databricks_registered_model",
    ),
    resourceCount: agent.resources.length,
  };
}
