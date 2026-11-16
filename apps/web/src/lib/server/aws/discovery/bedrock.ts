/**
 * Discovers Bedrock Agents, Agent Aliases, Knowledge Bases, Guardrails, and
 * Prompt (Prompt Management) resources — the anchor service for correlation.
 */

import {
  ListAgentsCommand,
  GetAgentCommand,
  GetAgentActionGroupCommand,
  paginateListAgentAliases,
  paginateListAgentActionGroups,
  paginateListKnowledgeBases,
  paginateListAgentKnowledgeBases,
  paginateListPrompts,
} from "@aws-sdk/client-bedrock-agent";
import { paginateListGuardrails } from "@aws-sdk/client-bedrock";
import type { AwsClientBundle } from "../client-factory";
import {
  collectPages,
  noteLookupFailure,
  type RawDiscoveredResource,
} from "./types";

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
      } catch (error) {
        // The summary still represents a valid discovered agent when the
        // connection lacks optional GetAgent detail permission.
        noteLookupFailure(clients, "Bedrock GetAgent", error);
      }

      // Action groups tell us which Lambda functions this agent can invoke —
      // the correlation engine uses this to attach Lambda/API/EventBridge
      // resources to the same logical agent.
      try {
        const actionGroups = await collectPages(
          paginateListAgentActionGroups(
            { client: bedrockAgent },
            { agentId: agent.agentId, agentVersion: "DRAFT" },
          ),
          (page) => page.actionGroupSummaries,
        );
        for (const summary of actionGroups) {
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
      } catch (error) {
        // Action group inspection is best-effort; a permissions gap here
        // shouldn't fail discovery of the agent itself.
        noteLookupFailure(clients, "Bedrock action groups", error);
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
        const aliases = await collectPages(
          paginateListAgentAliases(
            { client: bedrockAgent },
            { agentId: agent.agentId },
          ),
          (page) => page.agentAliasSummaries,
        );
        for (const alias of aliases) {
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
      } catch (error) {
        noteLookupFailure(clients, "Bedrock ListAgentAliases", error);
      }

      // Knowledge bases associated with this agent
      try {
        const kbs = await collectPages(
          paginateListAgentKnowledgeBases(
            { client: bedrockAgent },
            { agentId: agent.agentId, agentVersion: "DRAFT" },
          ),
          (page) => page.agentKnowledgeBaseSummaries,
        );
        for (const kb of kbs) {
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
      } catch (error) {
        noteLookupFailure(clients, "Bedrock ListAgentKnowledgeBases", error);
      }
    }
    agentNextToken = agentsResp.nextToken;
  } while (agentNextToken);

  // All knowledge bases in the account (covers ones not yet linked to an
  // agent, so the correlation engine can still surface them).
  try {
    const allKbs = await collectPages(
      paginateListKnowledgeBases({ client: bedrockAgent }, {}),
      (page) => page.knowledgeBaseSummaries,
    );
    for (const kb of allKbs) {
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
  } catch (error) {
    noteLookupFailure(clients, "Bedrock ListKnowledgeBases", error);
  }

  // Guardrails (Bedrock control-plane resource, not agent-scoped)
  try {
    const guardrails = await collectPages(
      paginateListGuardrails({ client: bedrock }, {}),
      (page) => page.guardrails,
    );
    for (const guardrail of guardrails) {
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
  } catch (error) {
    // guardrails may not be enabled for this account/region
    noteLookupFailure(clients, "Bedrock ListGuardrails", error);
  }

  // Prompt Management resources
  try {
    const prompts = await collectPages(
      paginateListPrompts({ client: bedrockAgent }, {}),
      (page) => page.promptSummaries,
    );
    for (const prompt of prompts) {
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
  } catch (error) {
    noteLookupFailure(clients, "Bedrock ListPrompts", error);
  }

  return resources;
}
