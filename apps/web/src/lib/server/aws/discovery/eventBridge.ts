/**
 * Discovers EventBridge rules that target an already-discovered AI Lambda
 * or Step Function — the "scheduled AI workflows" the spec asks for.
 */

import {
  ListRulesCommand,
  ListTargetsByRuleCommand,
} from "@aws-sdk/client-eventbridge";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

export async function discoverEventBridgeRules(
  clients: AwsClientBundle,
  aiTargetArns: Set<string>,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { eventBridge, region } = clients;
  if (aiTargetArns.size === 0) return resources;

  let nextToken: string | undefined;
  do {
    const page = await eventBridge.send(
      new ListRulesCommand({ NextToken: nextToken }),
    );
    for (const rule of page.Rules ?? []) {
      if (!rule.Name) continue;

      let matchedTargets: string[] = [];
      try {
        const targets = await eventBridge.send(
          new ListTargetsByRuleCommand({ Rule: rule.Name }),
        );
        matchedTargets = (targets.Targets ?? [])
          .map((t) => t.Arn)
          .filter(
            (arn): arn is string => Boolean(arn) && aiTargetArns.has(arn!),
          );
      } catch {
        // best-effort
      }
      if (matchedTargets.length === 0) continue;

      resources.push({
        resourceType: "eventbridge_rule",
        resourceId: rule.Name,
        resourceArn: rule.Arn ?? null,
        resourceName: rule.Name,
        region,
        tags: {},
        linkedFunctionArns: matchedTargets,
        metadata: {
          scheduleExpression: rule.ScheduleExpression ?? null,
          eventPattern: rule.EventPattern ?? null,
          state: rule.State,
        },
      });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return resources;
}
