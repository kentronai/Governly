/**
 * Discovers AI-related Lambda functions — either referenced by a Bedrock
 * Agent action group (passed in as `knownArns`) or self-identified via an
 * "AI signal" (tag or naming convention). No hardcoded function names.
 */

import JSZip from "jszip";
import {
  GetFunctionCommand,
  ListFunctionsCommand,
  ListTagsCommand,
} from "@aws-sdk/client-lambda";
import type { AwsClientBundle } from "../client-factory";
import {
  analyzeCodeBundle,
  extractModelIds,
  isManifestPath,
  isSourcePath,
} from "../../agents/agent-profile";
import type { RawDiscoveredResource } from "./types";
import { isDenied } from "./ec2";
import { lastDeployer } from "./cloudtrail";

const AI_NAME_PATTERN = /agent|bedrock|llm|genai|copilot|assistant/i;
const AI_TAG_KEYS = ["ai", "ai-agent", "bedrock", "norix:agent"];

function hasAiSignal(name: string, tags: Record<string, string>): boolean {
  if (AI_NAME_PATTERN.test(name)) return true;
  return AI_TAG_KEYS.some((key) => {
    const value = tags[key];
    return value !== undefined && value.toLowerCase() !== "false";
  });
}

const MAX_BUNDLE_BYTES = 30_000_000;
const MAX_SOURCE_FILES = 40;
const MAX_FILE_BYTES = 100_000;

/**
 * Downloads the function's deployed zip and reads its dependencies, tools and
 * model ids. Best-effort: needs lambda:GetFunction, skips container images and
 * oversized bundles, and returns {} on any failure.
 */
async function readCodeBundle(
  lambda: AwsClientBundle["lambda"],
  fn: { FunctionName?: string; PackageType?: string; CodeSize?: number },
): Promise<Record<string, unknown>> {
  if (fn.PackageType === "Image" || (fn.CodeSize ?? 0) > MAX_BUNDLE_BYTES) return {};
  try {
    const got = await lambda.send(new GetFunctionCommand({ FunctionName: fn.FunctionName }));
    const url = got.Code?.Location;
    if (!url) return {};
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return {};
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const paths = Object.keys(zip.files);
    const wanted = paths
      .filter((p) => !zip.files[p].dir && (isManifestPath(p) || isSourcePath(p)))
      .slice(0, MAX_SOURCE_FILES + 10);
    const texts: Record<string, string> = {};
    for (const path of wanted) {
      const text = await zip.files[path].async("string");
      if (text.length <= MAX_FILE_BYTES) texts[path] = text;
    }
    const facts = analyzeCodeBundle(paths, texts);
    return {
      codePackages: facts.packages,
      codeTools: facts.tools,
      codeModelIds: facts.modelIds,
      codeEnvKeys: facts.envKeys,
      codeProviders: facts.providers,
      codeApps: facts.apps,
    };
  } catch (e) {
    return isDenied(e) ? { permissionGaps: ["lambda:GetFunction"] } : {};
  }
}

export async function discoverLambda(
  clients: AwsClientBundle,
  knownArns: Set<string>,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { lambda, region } = clients;

  let marker: string | undefined;
  do {
    const page = await lambda.send(
      new ListFunctionsCommand({ Marker: marker }),
    );
    for (const fn of page.Functions ?? []) {
      if (!fn.FunctionArn || !fn.FunctionName) continue;

      let tags: Record<string, string> = {};
      try {
        const tagResp = await lambda.send(
          new ListTagsCommand({ Resource: fn.FunctionArn }),
        );
        tags = (tagResp.Tags as Record<string, string>) ?? {};
      } catch {
        // tag lookup is best-effort
      }

      const isKnown = knownArns.has(fn.FunctionArn);
      if (!isKnown && !hasAiSignal(fn.FunctionName, tags)) continue;

      const code = await readCodeBundle(lambda, fn);
      const gaps: string[] = Array.isArray(code.permissionGaps) ? [...(code.permissionGaps as string[])] : [];
      const deployer = await lastDeployer(clients.cloudtrail, fn.FunctionName, gaps);

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
          // Only model ids are lifted out of env values (never the values
          // themselves — they routinely hold secrets).
          modelIds: extractModelIds(
            Object.entries(fn.Environment?.Variables ?? {})
              .filter(([key]) => /model|llm|engine|deployment/i.test(key))
              .map(([, value]) => value)
              .join(" "),
          ),
          layers: (fn.Layers ?? [])
            .map((layer) => layer.Arn?.split(":layer:")[1])
            .filter(Boolean),
          tracing: fn.TracingConfig?.Mode ?? null,
          handler: fn.Handler ?? null,
          packageType: fn.PackageType ?? null,
          description: fn.Description ?? null,
          ...code,
          ...(deployer ?? {}),
          ...(gaps.length ? { permissionGaps: gaps } : {}),
        },
      });
    }
    marker = page.NextMarker;
  } while (marker);

  return resources;
}
