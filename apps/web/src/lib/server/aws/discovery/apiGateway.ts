/**
 * Discovers API Gateway REST (v1) and HTTP/WebSocket (v2) APIs whose
 * integration targets an already-discovered AI Lambda function — this is
 * also how the Risk engine's "public endpoint" signal gets real evidence
 * instead of a guess.
 */

import {
  paginateGetRestApis,
  paginateGetResources,
} from "@aws-sdk/client-api-gateway";
import {
  GetApisCommand,
  GetIntegrationsCommand,
} from "@aws-sdk/client-apigatewayv2";
import type { AwsClientBundle } from "../client-factory";
import {
  collectPages,
  noteLookupFailure,
  type RawDiscoveredResource,
} from "./types";

export async function discoverApiGateway(
  clients: AwsClientBundle,
  aiLambdaArns: Set<string>,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { apiGateway, apiGatewayV2, region } = clients;
  if (aiLambdaArns.size === 0) return resources;

  // REST APIs (v1)
  try {
    const restApis = await collectPages(
      paginateGetRestApis({ client: apiGateway, pageSize: 500 }, {}),
      (page) => page.items,
    );
    for (const api of restApis) {
      if (!api.id) continue;
      let referencesAiLambda = false;
      try {
        const apiResources = await collectPages(
          paginateGetResources(
            { client: apiGateway, pageSize: 500 },
            { restApiId: api.id, embed: ["methods"] },
          ),
          (page) => page.items,
        );
        referencesAiLambda = apiResources.some((resource) =>
          Object.values(resource.resourceMethods ?? {}).some((method) => {
            const uri = (method as any)?.methodIntegration?.uri as
              | string
              | undefined;
            return uri
              ? Array.from(aiLambdaArns).some((arn) => uri.includes(arn))
              : false;
          }),
        );
      } catch (error) {
        noteLookupFailure(clients, "API Gateway GetResources", error);
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
  } catch (error) {
    noteLookupFailure(clients, "API Gateway GetRestApis", error);
  }

  // HTTP / WebSocket APIs (v2)
  try {
    const httpApis = await collectPages(
      (async function* () {
        let NextToken: string | undefined;
        do {
          const page = await apiGatewayV2.send(new GetApisCommand({ NextToken }));
          yield page;
          NextToken = page.NextToken;
        } while (NextToken);
      })(),
      (page) => page.Items,
    );
    for (const api of httpApis) {
      if (!api.ApiId) continue;
      let referencesAiLambda = false;
      try {
        const integrations = await apiGatewayV2.send(
          new GetIntegrationsCommand({ ApiId: api.ApiId }),
        );
        referencesAiLambda = (integrations.Items ?? []).some((integration) =>
          Array.from(aiLambdaArns).some((arn) =>
            integration.IntegrationUri?.includes(arn),
          ),
        );
      } catch (error) {
        noteLookupFailure(clients, "API Gateway GetIntegrations", error);
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
  } catch (error) {
    noteLookupFailure(clients, "API Gateway GetApis", error);
  }

  return resources;
}
