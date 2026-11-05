/** Discover deployed Amazon Bedrock AgentCore Runtime agents. */

import {
  BedrockAgentCoreControlClient,
  GetAgentRuntimeCommand,
  ListAgentRuntimesCommand,
  ListTagsForResourceCommand,
  type GetAgentRuntimeCommandOutput,
} from "@aws-sdk/client-bedrock-agentcore-control";
import {
  awsDiscoveryClientConfig,
  type AwsCredentialIdentity,
} from "../client-factory";
import type { RawDiscoveredResource } from "./types";

const MODEL_ENV_KEYS = new Set([
  "MODEL",
  "MODEL_ID",
  "BEDROCK_MODEL_ID",
  "FOUNDATION_MODEL",
  "FOUNDATION_MODEL_ID",
]);

const iso = (value: Date | string | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

function modelFromEnvironment(
  environment: Record<string, string> | undefined,
): string | null {
  if (!environment) return null;
  const match = Object.entries(environment).find(([key]) =>
    MODEL_ENV_KEYS.has(key.toUpperCase()),
  );
  return match?.[1]?.trim() || null;
}

function clientFor(region: string, credentials: AwsCredentialIdentity) {
  return new BedrockAgentCoreControlClient({
    region,
    credentials,
    ...awsDiscoveryClientConfig,
  });
}

export async function hasAgentCoreRuntimes(
  region: string,
  credentials: AwsCredentialIdentity,
): Promise<boolean> {
  const response = await clientFor(region, credentials).send(
    new ListAgentRuntimesCommand({ maxResults: 1 }),
  );
  return (response.agentRuntimes?.length ?? 0) > 0;
}

export async function discoverAgentCoreRuntimes(
  region: string,
  credentials: AwsCredentialIdentity,
): Promise<RawDiscoveredResource[]> {
  const client = clientFor(region, credentials);
  const resources: RawDiscoveredResource[] = [];
  let nextToken: string | undefined;

  do {
    const page = await client.send(
      new ListAgentRuntimesCommand({ maxResults: 100, nextToken }),
    );

    for (const runtime of page.agentRuntimes ?? []) {
      if (!runtime.agentRuntimeId) continue;

      let detail: GetAgentRuntimeCommandOutput | null = null;
      let detailError: string | null = null;
      try {
        detail = await client.send(
          new GetAgentRuntimeCommand({
            agentRuntimeId: runtime.agentRuntimeId,
            agentRuntimeVersion: runtime.agentRuntimeVersion,
          }),
        );
      } catch (error) {
        detailError =
          error instanceof Error ? error.message : "GetAgentRuntime failed";
      }

      const runtimeArn =
        detail?.agentRuntimeArn ?? runtime.agentRuntimeArn ?? null;
      let tags: Record<string, string> = {};
      if (runtimeArn) {
        try {
          const tagResponse = await client.send(
            new ListTagsForResourceCommand({ resourceArn: runtimeArn }),
          );
          tags = tagResponse.tags ?? {};
        } catch {
          // Tag permission is optional. Runtime detail remains valid evidence.
        }
      }

      const environment = detail?.environmentVariables;
      const modelId = modelFromEnvironment(environment);
      resources.push({
        resourceType: "agentcore_runtime",
        resourceId: runtime.agentRuntimeId,
        resourceArn: runtimeArn,
        resourceName:
          detail?.agentRuntimeName ??
          runtime.agentRuntimeName ??
          runtime.agentRuntimeId,
        region,
        tags,
        linkedRoleArn: detail?.roleArn ?? null,
        createdAt: iso(detail?.createdAt),
        lastUpdatedAt: iso(detail?.lastUpdatedAt ?? runtime.lastUpdatedAt),
        metadata: {
          evidenceSource: detail
            ? "aws:GetAgentRuntime"
            : "aws:ListAgentRuntimes",
          detailAvailable: Boolean(detail),
          detailError,
          status: detail?.status ?? runtime.status ?? null,
          version:
            detail?.agentRuntimeVersion ?? runtime.agentRuntimeVersion ?? null,
          description: detail?.description ?? runtime.description ?? null,
          roleArn: detail?.roleArn ?? null,
          modelId,
          environmentKeys: Object.keys(environment ?? {}).sort(),
          agentRuntimeArtifact: detail?.agentRuntimeArtifact ?? null,
          networkConfiguration: detail?.networkConfiguration ?? null,
          protocolConfiguration: detail?.protocolConfiguration ?? null,
          authorizerConfiguration: detail?.authorizerConfiguration ?? null,
          workloadIdentityDetails: detail?.workloadIdentityDetails ?? null,
          lifecycleConfiguration: detail?.lifecycleConfiguration ?? null,
          metadataConfiguration: detail?.metadataConfiguration ?? null,
          filesystemConfigurations: detail?.filesystemConfigurations ?? [],
          requestHeaderConfiguration:
            detail?.requestHeaderConfiguration ?? null,
          failureReason: detail?.failureReason ?? null,
          createdAt: iso(detail?.createdAt),
          lastUpdatedAt: iso(detail?.lastUpdatedAt ?? runtime.lastUpdatedAt),
          tags,
        },
      });
    }
    nextToken = page.nextToken;
  } while (nextToken);

  return resources;
}
