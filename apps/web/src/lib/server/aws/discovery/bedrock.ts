/**
 * Discovers Bedrock Agents, Agent Aliases, Knowledge Bases, Guardrails, and
 * Prompt (Prompt Management) resources — the anchor service for correlation.
 */

import {
  ListAgentsCommand,
  GetAgentCommand,
  ListAgentAliasesCommand,
  ListAgentActionGroupsCommand,
  GetAgentActionGroupCommand,
  ListKnowledgeBasesCommand,
  ListAgentKnowledgeBasesCommand,
  ListPromptsCommand,
} from "@aws-sdk/client-bedrock-agent";
import { ListGuardrailsCommand } from "@aws-sdk/client-bedrock";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

export async function discoverBedrock(
  clients: AwsClientBundle,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { bedrockAgent, bedrock, region, accountId } = clients;

  let agentNextToken: string | undefined;
  do {
    const agentsResp = await bedrockAgent.send(
      new ListAgentsCommand({ nextToken: agentNextToken }),
    );

    for (const agent of agentsResp.agentSummaries ?? []) {
      if (!agent.agentId) continue;

      const linkedFunctionArns: string[] = [];
      const actionGroupNames: string[] = [];
      let linkedRoleArn: string | null = null;
      let foundationModel: string | null = null;

      try {
        const detail = await bedrockAgent.send(
          new GetAgentCommand({ agentId: agent.agentId }),
        );
        linkedRoleArn = detail.agent?.agentResourceRoleArn ?? null;
        foundationModel = detail.agent?.foundationModel ?? null;
      } catch {
        // The summary still represents a valid discovered agent when the
        // connection lacks optional GetAgent detail permission.
      }

      // Action groups tell us which Lambda functions this agent can invoke —
      // the correlation engine uses this to attach Lambda/API/EventBridge
      // resources to the same logical agent.
      try {
        const actionGroups = await bedrockAgent.send(
          new ListAgentActionGroupsCommand({
            agentId: agent.agentId,
            agentVersion: "DRAFT",
          }),
        );
        for (const summary of actionGroups.actionGroupSummaries ?? []) {
          if (!summary.actionGroupId) continue;
          if (summary.actionGroupName) actionGroupNames.push(summary.actionGroupName);
          const detail = await bedrockAgent.send(
            new GetAgentActionGroupCommand({
              agentId: agent.agentId,
              agentVersion: "DRAFT",
              actionGroupId: summary.actionGroupId,
            }),
          );
          const lambdaArn =
            detail.agentActionGroup?.actionGroupExecutor?.lambda;
          if (lambdaArn) linkedFunctionArns.push(lambdaArn);
        }
      } catch {
        // Action group inspection is best-effort; a permissions gap here
        // shouldn't fail discovery of the agent itself.
      }

      resources.push({
        resourceType: "bedrock_agent",
        resourceId: agent.agentId,
        // ListAgents summaries don't include the ARN; Bedrock agent ARNs
        // follow a fixed, documented format.
        resourceArn: `arn:aws:bedrock:${region}:${accountId}:agent/${agent.agentId}`,
        resourceName: agent.agentName ?? agent.agentId,
        region,
        tags: {},
        linkedRoleArn,
        linkedFunctionArns,
        createdAt: agent.updatedAt?.toISOString?.() ?? null,
        lastUpdatedAt: agent.updatedAt?.toISOString?.() ?? null,
        metadata: {
          agentStatus: agent.agentStatus,
          latestAgentVersion: agent.latestAgentVersion,
          description: agent.description,
          foundationModel,
          actionGroupNames,
        },
      });

      // Aliases (deployment stages of an agent)
      try {
        const aliases = await bedrockAgent.send(
          new ListAgentAliasesCommand({ agentId: agent.agentId }),
        );
        for (const alias of aliases.agentAliasSummaries ?? []) {
          if (!alias.agentAliasId) continue;
          resources.push({
            resourceType: "bedrock_agent_alias",
            resourceId: `${agent.agentId}/${alias.agentAliasId}`,
            resourceArn: `arn:aws:bedrock:${region}:${accountId}:agent-alias/${agent.agentId}/${alias.agentAliasId}`,
            resourceName: alias.agentAliasName ?? alias.agentAliasId,
            region,
            tags: {},
            linkedFunctionArns: [],
            metadata: {
              parentAgentId: agent.agentId,
              status: alias.agentAliasStatus,
            },
          });
        }
      } catch {
        // best-effort
      }

      // Knowledge bases associated with this agent
      try {
        const kbs = await bedrockAgent.send(
          new ListAgentKnowledgeBasesCommand({
            agentId: agent.agentId,
            agentVersion: "DRAFT",
          }),
        );
        for (const kb of kbs.agentKnowledgeBaseSummaries ?? []) {
          if (!kb.knowledgeBaseId) continue;
          resources.push({
            resourceType: "knowledge_base",
            resourceId: kb.knowledgeBaseId,
            resourceArn: null,
            resourceName: kb.knowledgeBaseId,
            region,
            tags: {},
            metadata: {
              parentAgentId: agent.agentId,
              description: kb.description,
            },
          });
        }
      } catch {
        // best-effort
      }
    }
    agentNextToken = agentsResp.nextToken;
  } while (agentNextToken);

  // All knowledge bases in the account (covers ones not yet linked to an
  // agent, so the correlation engine can still surface them).
  try {
    const allKbs = await bedrockAgent.send(new ListKnowledgeBasesCommand({}));
    for (const kb of allKbs.knowledgeBaseSummaries ?? []) {
      if (!kb.knowledgeBaseId) continue;
      if (
        resources.some(
          (r) =>
            r.resourceType === "knowledge_base" &&
            r.resourceId === kb.knowledgeBaseId,
        )
      ) {
        continue;
      }
      resources.push({
        resourceType: "knowledge_base",
        resourceId: kb.knowledgeBaseId,
        resourceArn: null,
        resourceName: kb.name ?? kb.knowledgeBaseId,
        region,
        tags: {},
        metadata: { status: kb.status },
      });
    }
  } catch {
    // best-effort
  }

  // Guardrails (Bedrock control-plane resource, not agent-scoped)
  try {
    const guardrails = await bedrock.send(new ListGuardrailsCommand({}));
    for (const guardrail of guardrails.guardrails ?? []) {
      if (!guardrail.id) continue;
      resources.push({
        resourceType: "guardrail",
        resourceId: guardrail.id,
        resourceArn: guardrail.arn ?? null,
        resourceName: guardrail.name ?? guardrail.id,
        region,
        tags: {},
        metadata: { status: guardrail.status, version: guardrail.version },
      });
    }
  } catch {
    // best-effort — guardrails may not be enabled for this account/region
  }

  // Prompt Management resources
  try {
    const prompts = await bedrockAgent.send(new ListPromptsCommand({}));
    for (const prompt of prompts.promptSummaries ?? []) {
      if (!prompt.id) continue;
      resources.push({
        resourceType: "prompt",
        resourceId: prompt.id,
        resourceArn: prompt.arn ?? null,
        resourceName: prompt.name ?? prompt.id,
        region,
        tags: {},
        metadata: { description: prompt.description, version: prompt.version },
      });
    }
  } catch {
    // best-effort
  }

  return resources;
}
