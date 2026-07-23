/**
 * Runs a full discovery scan for one AWS connection: discover across all 8
 * services, correlate into logical agents, run the capability/autonomy/
 * risk/ownership/recommendations engines per agent, and persist everything.
 * This is the only place that writes to `agents`/`agent_resources`/
 * `agent_recommendations`/`discovery_scans`.
 */

import {
  db,
  agents,
  agentResources,
  agentRecommendations,
  discoveryScans,
} from "@db";
import { and, eq } from "drizzle-orm";
import {
  buildAwsClients,
  type DiscoveryConnectionRecord,
} from "./client-factory";
import { resolveDiscoveryRegions } from "./regions";
import { discoverBedrock } from "./discovery/bedrock";
import { discoverAgentCoreRuntimes } from "./discovery/agentCore";
import { discoverLambda } from "./discovery/lambda";
import { discoverStepFunctions } from "./discovery/stepFunctions";
import { discoverCloudWatchLogGroups } from "./discovery/cloudwatch";
import { discoverIamRoles } from "./discovery/iam";
import { discoverSecretsManagerSecrets } from "./discovery/secretsManager";
import { discoverApiGateway } from "./discovery/apiGateway";
import { discoverEventBridgeRules } from "./discovery/eventBridge";
import { discoverEc2 } from "./discovery/ec2";
import { correlateAgents } from "./correlation";
import { buildCapabilityFacts } from "../agents/capability-engine";
import { classifyAutonomy } from "../agents/autonomy-engine";
import { assessRisk } from "../agents/risk-engine";
import { detectOwnership } from "../agents/ownership-engine";
import { generateRecommendations } from "../agents/recommendations-engine";
import type { RawDiscoveredResource } from "./discovery/types";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";

export interface RunScanResult {
  scanId: string;
  status: "completed" | "failed";
  agentsDiscovered: number;
  resourcesScanned: Record<string, number>;
  errorMessage?: string;
}

export async function runDiscoveryScan(
  tenantId: string,
  connectionId: string,
  connection: DiscoveryConnectionRecord,
  triggeredBy: string | null,
): Promise<RunScanResult> {
  const [scan] = await db
    .insert(discoveryScans)
    .values({
      tenantId,
      connectionId,
      status: "running",
      startedAt: new Date().toISOString(),
      triggeredBy,
    })
    .returning();

  try {
    const regionResolution = await resolveDiscoveryRegions(connection);
    const regions = regionResolution.regions;

    const bedrockResources: RawDiscoveredResource[] = [];
    const agentCoreResources: RawDiscoveredResource[] = [];
    const lambdaResources: RawDiscoveredResource[] = [];
    const stepFunctionResources: RawDiscoveredResource[] = [];
    const iamResources: RawDiscoveredResource[] = [];
    const cloudwatchResources: RawDiscoveredResource[] = [];
    const secretsResources: RawDiscoveredResource[] = [];
    const apiGatewayResources: RawDiscoveredResource[] = [];
    const eventBridgeResources: RawDiscoveredResource[] = [];
    const ec2Resources: RawDiscoveredResource[] = [];

    let accountId = "unknown";
    const regionErrors: string[] = [];
    const serviceWarnings: string[] = [];
    let ec2RegionsScanned = 0;

    for (const region of regions) {
      try {
        const clients = await buildAwsClients(connection, {
          region,
          credentials: regionResolution.credentials,
        });
        accountId = clients.accountId;

        // Capture explicitly identified EC2 agents even in regions where
        // Bedrock is unavailable or access to another service is denied.
        try {
          ec2Resources.push(...(await discoverEc2(clients)));
          ec2RegionsScanned += 1;
        } catch (error) {
          serviceWarnings.push(
            `${region} EC2: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }

        const regionBedrock = await discoverBedrock(clients);
        try {
          agentCoreResources.push(
            ...(await discoverAgentCoreRuntimes(
              region,
              regionResolution.credentials,
            )),
          );
        } catch (error) {
          serviceWarnings.push(
            `${region} AgentCore: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }

        const knownLambdaArns = new Set(
          regionBedrock.flatMap((r) => r.linkedFunctionArns ?? []),
        );
        const regionLambda = await discoverLambda(clients, knownLambdaArns);
        const aiLambdaArns = new Set(
          regionLambda
            .map((r) => r.resourceArn)
            .filter((a): a is string => Boolean(a)),
        );
        const aiLambdaNames = regionLambda.map((r) => r.resourceName);

        const regionStepFunctions = await discoverStepFunctions(
          clients,
          aiLambdaArns,
        );

        const allRoleArns = new Set([
          ...regionBedrock
            .map((r) => r.linkedRoleArn)
            .filter((a): a is string => Boolean(a)),
          ...agentCoreResources
            .filter((r) => r.region === region)
            .map((r) => r.linkedRoleArn)
            .filter((a): a is string => Boolean(a)),
          ...regionLambda
            .map((r) => r.linkedRoleArn)
            .filter((a): a is string => Boolean(a)),
        ]);
        const regionIam = await discoverIamRoles(clients, allRoleArns);

        const regionCloudwatch = await discoverCloudWatchLogGroups(
          clients,
          aiLambdaNames,
        );

        const regionSecrets = await discoverSecretsManagerSecrets(
          clients,
          new Set(aiLambdaNames),
        );

        const regionApiGateway = await discoverApiGateway(
          clients,
          aiLambdaArns,
        );

        const eventBridgeTargets = new Set([
          ...aiLambdaArns,
          ...regionStepFunctions
            .map((r) => r.resourceArn)
            .filter((a): a is string => Boolean(a)),
        ]);
        const regionEventBridge = await discoverEventBridgeRules(
          clients,
          eventBridgeTargets,
        );

        bedrockResources.push(...regionBedrock);
        lambdaResources.push(...regionLambda);
        stepFunctionResources.push(...regionStepFunctions);
        iamResources.push(...regionIam);
        cloudwatchResources.push(...regionCloudwatch);
        secretsResources.push(...regionSecrets);
        apiGatewayResources.push(...regionApiGateway);
        eventBridgeResources.push(...regionEventBridge);
      } catch (regionError) {
        // A single unreachable/unsupported region (e.g. Bedrock not enabled
        // there) shouldn't fail the whole multi-region scan.
        regionErrors.push(
          `${region}: ${regionError instanceof Error ? regionError.message : "Unknown error"}`,
        );
      }
    }

    if (regionErrors.length === regions.length && ec2RegionsScanned === 0) {
      throw new Error(`All regions failed: ${regionErrors.join("; ")}`);
    }

    const allResources: RawDiscoveredResource[] = [
      ...bedrockResources,
      ...agentCoreResources,
      ...lambdaResources,
      ...stepFunctionResources,
      ...iamResources,
      ...cloudwatchResources,
      ...secretsResources,
      ...apiGatewayResources,
      ...eventBridgeResources,
      ...ec2Resources,
    ];

    const correlated = correlateAgents(allResources);

    const nowIso = new Date().toISOString();

    for (const agent of correlated) {
      const ownership = await detectOwnership(agent);
      const facts = buildCapabilityFacts(agent, ownership.ownerUserId);
      const autonomy = await classifyAutonomy(tenantId, facts);
      const risk = await assessRisk(tenantId, facts);
      const recommendations = generateRecommendations(
        facts,
        autonomy,
        ownership,
      );

      const primaryModel = agent.resources.find(
        (r) =>
          r.resourceType === "bedrock_agent" ||
          r.resourceType === "agentcore_runtime",
      );
      const primaryAnchor = agent.resources.find(
        (r) => r.resourceType === agent.discoverySource,
      );
      const primaryRole = agent.resources.find(
        (r) => r.resourceType === "iam_role",
      );
      const primaryKnowledgeBase = agent.resources.find(
        (r) => r.resourceType === "knowledge_base",
      );

      const existing = await db.query.agents.findFirst({
        where: and(
          eq(agents.connectionId, connectionId),
          eq(agents.externalAgentId, agent.externalAgentId),
        ),
      });

      const agentValues = {
        tenantId,
        connectionId,
        externalAgentId: agent.externalAgentId,
        name: agent.name,
        platform: agent.platform,
        region: agent.region,
        accountId,
        model:
          typeof primaryModel?.metadata.foundationModel === "string"
            ? primaryModel.metadata.foundationModel
            : typeof primaryModel?.metadata.modelId === "string"
              ? primaryModel.metadata.modelId
              : null,
        knowledgeBaseId: primaryKnowledgeBase?.resourceId ?? null,
        iamRoleArn:
          primaryRole?.resourceArn ?? primaryAnchor?.linkedRoleArn ?? null,
        credentialType:
          connection.authMethod === "access_key"
            ? ("api_key" as const)
            : ("service_account" as const),
        ownerUserId: ownership.ownerUserId,
        ownerSource: ownership.ownerSource,
        ownerConfidence: String(ownership.ownerConfidence),
        businessFunction: ownership.businessFunction,
        status: (facts.isDormant ? "dormant" : "active") as
          | "dormant"
          | "active",
        // A discovery scan is not agent usage. Keep this field tied to actual
        // AWS role activity (or previously attributed runtime traffic).
        lastUsedAt:
          typeof primaryRole?.metadata.lastUsedDate === "string"
            ? primaryRole.metadata.lastUsedDate
            : (existing?.lastUsedAt ?? null),
        capabilities: facts,
        autonomyLevel: autonomy.level,
        autonomyReason: autonomy.reason,
        autonomyEvidence: autonomy.evidence,
        autonomyConfidence: String(autonomy.confidence),
        autonomyClassifiedAt: nowIso,
        riskScore: String(risk.score),
        riskLevel: risk.level,
        riskFactors: risk.factors,
        discoverySource: agent.discoverySource,
        lastSeenAt: nowIso,
        syncStatus: "success" as const,
        rawMetadata: {
          evidenceSource:
            primaryAnchor?.metadata.evidenceSource ?? "provider_discovery",
          resourceCount: agent.resources.length,
          primaryModel:
            typeof primaryModel?.metadata.foundationModel === "string"
              ? primaryModel.metadata.foundationModel
              : (primaryModel?.metadata.modelId ?? null),
          providerEvidence: primaryAnchor
            ? {
                resourceArn: primaryAnchor.resourceArn,
                resourceName: primaryAnchor.resourceName,
                resourceType: primaryAnchor.resourceType,
                region: primaryAnchor.region,
                createdAt: primaryAnchor.createdAt,
                lastUpdatedAt: primaryAnchor.lastUpdatedAt,
                tags: primaryAnchor.tags,
                ...primaryAnchor.metadata,
              }
            : null,
        },
        updatedAt: nowIso,
      };

      let agentId: string;
      if (existing) {
        agentId = existing.id;
        await db
          .update(agents)
          .set(agentValues)
          .where(eq(agents.id, existing.id));
      } else {
        const [inserted] = await db
          .insert(agents)
          .values({ ...agentValues, firstSeenAt: nowIso })
          .returning();
        agentId = inserted.id;
      }

      // Refresh the resource/recommendation snapshot for this agent.
      await db
        .delete(agentResources)
        .where(eq(agentResources.agentId, agentId));
      if (agent.resources.length > 0) {
        await db.insert(agentResources).values(
          agent.resources.map((r) => ({
            tenantId,
            agentId,
            resourceType: r.resourceType,
            resourceArn: r.resourceArn,
            resourceName: r.resourceName,
            region: r.region,
            rawData: r.metadata,
          })),
        );
      }

      await db
        .delete(agentRecommendations)
        .where(
          and(
            eq(agentRecommendations.agentId, agentId),
            eq(agentRecommendations.status, "open"),
          ),
        );
      if (recommendations.length > 0) {
        await db.insert(agentRecommendations).values(
          recommendations.map((rec) => ({
            tenantId,
            agentId,
            recommendationType: rec.recommendationType,
            reason: rec.reason,
            severity: rec.severity,
            suggestedFix: rec.suggestedFix,
          })),
        );
      }

      // Every newly discovered or refreshed agent immediately inherits active
      // tenant compliance policies and its linked application's runtime policy.
      await syncAgentPolicyEvaluations(tenantId, agentId);
    }

    const resourcesScanned: Record<string, number> = {
      bedrock_agent: bedrockResources.filter(
        (r) => r.resourceType === "bedrock_agent",
      ).length,
      agentcore_runtime: agentCoreResources.length,
      lambda_function: lambdaResources.length,
      step_function: stepFunctionResources.length,
      iam_role: iamResources.length,
      cloudwatch_log_group: cloudwatchResources.length,
      secrets_manager_secret: secretsResources.length,
      api_gateway_api: apiGatewayResources.length,
      eventbridge_rule: eventBridgeResources.length,
      ec2_instance: ec2Resources.length,
    };

    const warningParts: string[] = [];
    if (regionResolution.warning) warningParts.push(regionResolution.warning);
    if (regionErrors.length > 0) {
      warningParts.push(
        `Scanned ${regions.length - regionErrors.length}/${regions.length} regions. Skipped: ${regionErrors.join("; ")}`,
      );
    }
    if (serviceWarnings.length > 0) warningParts.push(...serviceWarnings);
    const partialWarning = warningParts.length
      ? warningParts.join("; ")
      : undefined;

    await db
      .update(discoveryScans)
      .set({
        status: "completed",
        finishedAt: new Date().toISOString(),
        agentsDiscovered: correlated.length,
        resourcesScanned,
        errorMessage: partialWarning ?? null,
      })
      .where(eq(discoveryScans.id, scan.id));

    return {
      scanId: scan.id,
      status: "completed",
      agentsDiscovered: correlated.length,
      resourcesScanned,
      errorMessage: partialWarning,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown discovery error";
    await db
      .update(discoveryScans)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        errorMessage,
      })
      .where(eq(discoveryScans.id, scan.id));

    return {
      scanId: scan.id,
      status: "failed",
      agentsDiscovered: 0,
      resourcesScanned: {},
      errorMessage,
    };
  }
}
