/**
 * Groups the flat list of raw discovered AWS resources into logical
 * agents. A Bedrock Agent is the anchor when present — its IAM role,
 * knowledge bases, aliases, and any Lambda/Step Function/API
 * Gateway/EventBridge/Secrets Manager resource it references all become
 * part of the same logical agent. Guardrails and Prompts are account-level
 * Bedrock resources with no per-agent reference in the AWS API, so they're
 * attached to every Bedrock agent as shared resources (flagged as such in
 * metadata) rather than guessed at.
 *
 * A resource with an AI signal but no Bedrock anchor (e.g. a standalone
 * AI-tagged Lambda) becomes its own single-resource logical agent.
 */

import type { RawDiscoveredResource } from "./discovery/types";

export interface CorrelatedAgent {
  externalAgentId: string;
  name: string;
  platform:
    | "aws_bedrock"
    | "aws_agentcore"
    | "aws_lambda"
    | "aws_step_functions"
    | "aws_ec2"
    | "aws_eks"
    | "amazon_q"
    | "azure_openai"
    | "azure_ai_foundry"
    | "azure_functions"
    | "azure_logic_apps"
    | "azure_virtual_machines"
    | "azure_container_apps"
    | "azure_aks"
    | "gcp_vertex_ai"
    | "gcp_cloud_run"
    | "gcp_compute"
    | "gcp_gke"
    | "gcp_functions"
    | "databricks_model_serving"
    | "databricks_unity_catalog"
    | "databricks_apps"
    | "databricks_jobs"
    | "databricks_genie"
    | "kubernetes"
    | "crewai"
    | "other";
  region: string;
  discoverySource: RawDiscoveredResource["resourceType"];
  resources: RawDiscoveredResource[];
}

export function correlateAgents(
  allResources: RawDiscoveredResource[],
): CorrelatedAgent[] {
  const agents: CorrelatedAgent[] = [];

  const bedrockAgents = allResources.filter(
    (r) => r.resourceType === "bedrock_agent",
  );
  const agentCoreRuntimes = allResources.filter(
    (r) => r.resourceType === "agentcore_runtime",
  );
  const aliases = allResources.filter(
    (r) => r.resourceType === "bedrock_agent_alias",
  );
  const knowledgeBases = allResources.filter(
    (r) => r.resourceType === "knowledge_base",
  );
  const guardrails = allResources.filter((r) => r.resourceType === "guardrail");
  const prompts = allResources.filter((r) => r.resourceType === "prompt");
  const lambdas = allResources.filter(
    (r) => r.resourceType === "lambda_function",
  );
  const iamRoles = allResources.filter((r) => r.resourceType === "iam_role");
  const stepFunctions = allResources.filter(
    (r) => r.resourceType === "step_function",
  );
  const apiGateways = allResources.filter(
    (r) => r.resourceType === "api_gateway_api",
  );
  const eventBridgeRules = allResources.filter(
    (r) => r.resourceType === "eventbridge_rule",
  );
  const secrets = allResources.filter(
    (r) => r.resourceType === "secrets_manager_secret",
  );
  const ec2Instances = allResources.filter(
    (r) => r.resourceType === "ec2_instance",
  );

  const attachedLambdaArns = new Set<string>();

  for (const runtime of agentCoreRuntimes) {
    const runtimeRole = runtime.linkedRoleArn
      ? iamRoles.find((role) => role.resourceArn === runtime.linkedRoleArn)
      : undefined;
    agents.push({
      externalAgentId: `${runtime.region}:${runtime.resourceId}`,
      name: runtime.resourceName,
      platform: "aws_agentcore",
      region: runtime.region,
      discoverySource: "agentcore_runtime",
      resources: runtimeRole ? [runtime, runtimeRole] : [runtime],
    });
  }

  for (const agent of bedrockAgents) {
    const group: RawDiscoveredResource[] = [agent];
    const agentLambdaArns = new Set(agent.linkedFunctionArns ?? []);

    for (const alias of aliases) {
      if (alias.metadata.parentAgentId === agent.resourceId) group.push(alias);
    }
    for (const kb of knowledgeBases) {
      if (kb.metadata.parentAgentId === agent.resourceId) group.push(kb);
    }

    const linkedLambdas = lambdas.filter(
      (fn) => fn.resourceArn && agentLambdaArns.has(fn.resourceArn),
    );
    for (const fn of linkedLambdas) {
      group.push(fn);
      if (fn.resourceArn) attachedLambdaArns.add(fn.resourceArn);
      if (fn.linkedRoleArn) {
        const role = iamRoles.find((r) => r.resourceArn === fn.linkedRoleArn);
        if (role) group.push(role);
      }
    }

    const linkedLambdaArnSet = new Set(
      linkedLambdas.map((fn) => fn.resourceArn).filter(Boolean) as string[],
    );
    for (const sf of stepFunctions) {
      if (
        (sf.linkedFunctionArns ?? []).some((arn) => linkedLambdaArnSet.has(arn))
      )
        group.push(sf);
    }
    for (const api of apiGateways) {
      // API Gateway resources are attached during discovery filtering already
      // (they only surface if they reference an AI lambda); include all here
      // since correlation-level filtering per-agent would need the same
      // integration lookup already done once in discovery.
      group.push(api);
    }
    for (const rule of eventBridgeRules) {
      if (
        (rule.linkedFunctionArns ?? []).some((arn) =>
          linkedLambdaArnSet.has(arn),
        )
      )
        group.push(rule);
    }
    for (const secret of secrets) {
      group.push(secret);
    }

    // Guardrails/Prompts are account-level Bedrock resources with no
    // per-agent API reference — attach as shared, explicitly labeled.
    for (const g of guardrails)
      group.push({ ...g, metadata: { ...g.metadata, shared: true } });
    for (const p of prompts)
      group.push({ ...p, metadata: { ...p.metadata, shared: true } });

    agents.push({
      // AWS resource IDs are region-scoped. Include the region so two agents
      // in different regions can never overwrite one another in inventory.
      externalAgentId: `${agent.region}:${agent.resourceId}`,
      name: agent.resourceName,
      platform: "aws_bedrock",
      region: agent.region,
      discoverySource: "bedrock_agent",
      resources: group,
    });
  }

  // Any AI-signal Lambda not already attached to a Bedrock agent becomes
  // its own single-resource logical agent.
  for (const fn of lambdas) {
    if (fn.resourceArn && attachedLambdaArns.has(fn.resourceArn)) continue;
    const group: RawDiscoveredResource[] = [fn];
    if (fn.linkedRoleArn) {
      const role = iamRoles.find((r) => r.resourceArn === fn.linkedRoleArn);
      if (role) group.push(role);
    }
    const arnSet = new Set([fn.resourceArn].filter(Boolean) as string[]);
    for (const sf of stepFunctions) {
      if ((sf.linkedFunctionArns ?? []).some((a) => arnSet.has(a)))
        group.push(sf);
    }
    for (const rule of eventBridgeRules) {
      if ((rule.linkedFunctionArns ?? []).some((a) => arnSet.has(a)))
        group.push(rule);
    }

    agents.push({
      externalAgentId: `${fn.region}:${fn.resourceId}`,
      name: fn.resourceName,
      platform: "aws_lambda",
      region: fn.region,
      discoverySource: "lambda_function",
      resources: group,
    });
  }

  for (const instance of ec2Instances) {
    agents.push({
      externalAgentId: `${instance.region}:${instance.resourceId}`,
      name: instance.resourceName,
      platform: "aws_ec2",
      region: instance.region,
      discoverySource: "ec2_instance",
      resources: [instance],
    });
  }

  return agents;
}
