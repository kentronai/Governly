/**
 * Discovers AI-related Lambda functions — either referenced by a Bedrock
 * Agent action group (passed in as `knownArns`) or self-identified via an
 * "AI signal" (tag or naming convention). No hardcoded function names.
 */

import { ListFunctionsCommand, ListTagsCommand } from "@aws-sdk/client-lambda";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

const AI_NAME_PATTERN = /agent|bedrock|llm|genai|copilot|assistant/i;
const AI_TAG_KEYS = ["ai", "ai-agent", "bedrock", "norix:agent"];

function hasAiSignal(name: string, tags: Record<string, string>): boolean {
  if (AI_NAME_PATTERN.test(name)) return true;
  return AI_TAG_KEYS.some((key) => {
    const value = tags[key];
    return value !== undefined && value.toLowerCase() !== "false";
  });
}

export async function discoverLambda(
  clients: AwsClientBundle,
  knownArns: Set<string>
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { lambda, region } = clients;

  let marker: string | undefined;
  do {
    const page = await lambda.send(new ListFunctionsCommand({ Marker: marker }));
    for (const fn of page.Functions ?? []) {
      if (!fn.FunctionArn || !fn.FunctionName) continue;

      let tags: Record<string, string> = {};
      try {
        const tagResp = await lambda.send(
          new ListTagsCommand({ Resource: fn.FunctionArn })
        );
        tags = (tagResp.Tags as Record<string, string>) ?? {};
      } catch {
        // tag lookup is best-effort
      }

      const isKnown = knownArns.has(fn.FunctionArn);
      if (!isKnown && !hasAiSignal(fn.FunctionName, tags)) continue;

      resources.push({
        resourceType: "lambda_function",
        resourceId: fn.FunctionName,
        resourceArn: fn.FunctionArn,
        resourceName: fn.FunctionName,
        region,
        tags,
        linkedRoleArn: fn.Role ?? null,
        lastUpdatedAt: fn.LastModified ?? null,
        metadata: {
          runtime: fn.Runtime,
          memorySize: fn.MemorySize,
          timeout: fn.Timeout,
          vpcConfigured: Boolean(fn.VpcConfig?.VpcId),
          environmentKeys: Object.keys(fn.Environment?.Variables ?? {}),
        },
      });
    }
    marker = page.NextMarker;
  } while (marker);

  return resources;
}
