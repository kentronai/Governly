/**
 * Discovers API Gateway REST (v1) and HTTP/WebSocket (v2) APIs whose
 * integration targets an already-discovered AI Lambda function — this is
 * also how the Risk engine's "public endpoint" signal gets real evidence
 * instead of a guess.
 */

import { GetRestApisCommand, GetResourcesCommand } from "@aws-sdk/client-api-gateway";
import { GetApisCommand, GetIntegrationsCommand } from "@aws-sdk/client-apigatewayv2";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

export async function discoverApiGateway(
  clients: AwsClientBundle,
  aiLambdaArns: Set<string>
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { apiGateway, apiGatewayV2, region } = clients;
  if (aiLambdaArns.size === 0) return resources;

  // REST APIs (v1)
  try {
    const restApis = await apiGateway.send(new GetRestApisCommand({}));
    for (const api of restApis.items ?? []) {
      if (!api.id) continue;
      let referencesAiLambda = false;
      try {
        const apiResources = await apiGateway.send(
          new GetResourcesCommand({ restApiId: api.id })
        );
        referencesAiLambda = (apiResources.items ?? []).some((resource) =>
          Object.values(resource.resourceMethods ?? {}).some((method) => {
            const uri = (method as any)?.methodIntegration?.uri as string | undefined;
            return uri ? Array.from(aiLambdaArns).some((arn) => uri.includes(arn)) : false;
          })
        );
      } catch {
        // best-effort
      }
      if (!referencesAiLambda) continue;

      resources.push({
        resourceType: "api_gateway_api",
        resourceId: api.id,
        resourceArn: null,
        resourceName: api.name ?? api.id,
        region,
        tags: (api.tags as Record<string, string>) ?? {},
        createdAt: api.createdDate?.toISOString?.() ?? null,
        metadata: {
          endpointType: api.endpointConfiguration?.types?.join(",") ?? "EDGE",
          apiVersion: "v1",
        },
      });
    }
  } catch {
    // best-effort
  }

  // HTTP / WebSocket APIs (v2)
  try {
    const httpApis = await apiGatewayV2.send(new GetApisCommand({}));
    for (const api of httpApis.Items ?? []) {
      if (!api.ApiId) continue;
      let referencesAiLambda = false;
      try {
        const integrations = await apiGatewayV2.send(
          new GetIntegrationsCommand({ ApiId: api.ApiId })
        );
        referencesAiLambda = (integrations.Items ?? []).some((integration) =>
          Array.from(aiLambdaArns).some((arn) =>
            integration.IntegrationUri?.includes(arn)
          )
        );
      } catch {
        // best-effort
      }
      if (!referencesAiLambda) continue;

      resources.push({
        resourceType: "api_gateway_api",
        resourceId: api.ApiId,
        resourceArn: null,
        resourceName: api.Name ?? api.ApiId,
        region,
        tags: api.Tags ?? {},
        createdAt: api.CreatedDate?.toISOString?.() ?? null,
        metadata: { protocolType: api.ProtocolType, apiVersion: "v2" },
      });
    }
  } catch {
    // best-effort
  }

  return resources;
}
