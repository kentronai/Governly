/**
 * Discovers CloudWatch log groups belonging to already-discovered AI
 * resources (Bedrock, or an AI-tagged Lambda), by AWS's own naming
 * convention for those services — not a separate heuristic.
 */

import { DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

export async function discoverCloudWatchLogGroups(
  clients: AwsClientBundle,
  lambdaFunctionNames: string[]
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { cloudWatchLogs, region } = clients;

  const prefixesToCheck = [
    "/aws/bedrock",
    ...lambdaFunctionNames.map((name) => `/aws/lambda/${name}`),
  ];

  for (const prefix of prefixesToCheck) {
    try {
      const resp = await cloudWatchLogs.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix: prefix })
      );
      for (const group of resp.logGroups ?? []) {
        if (!group.logGroupName) continue;
        resources.push({
          resourceType: "cloudwatch_log_group",
          resourceId: group.logGroupName,
          resourceArn: group.arn ?? null,
          resourceName: group.logGroupName,
          region,
          tags: {},
          metadata: {
            retentionInDays: group.retentionInDays ?? null,
            storedBytes: group.storedBytes ?? null,
          },
        });
      }
    } catch {
      // a missing log group for a given prefix is expected, not an error
    }
  }

  return resources;
}
