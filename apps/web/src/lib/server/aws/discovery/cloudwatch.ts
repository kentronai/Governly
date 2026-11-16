/**
 * Discovers CloudWatch log groups belonging to already-discovered AI
 * resources (Bedrock, or an AI-tagged Lambda), by AWS's own naming
 * convention for those services — not a separate heuristic.
 */

import { paginateDescribeLogGroups } from "@aws-sdk/client-cloudwatch-logs";
import type { AwsClientBundle } from "../client-factory";
import {
  collectPages,
  noteLookupFailure,
  type RawDiscoveredResource,
} from "./types";

export async function discoverCloudWatchLogGroups(
  clients: AwsClientBundle,
  lambdaFunctionNames: string[],
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { cloudWatchLogs, region } = clients;

  const prefixesToCheck = [
    "/aws/bedrock",
    ...lambdaFunctionNames.map((name) => `/aws/lambda/${name}`),
  ];

  for (const prefix of prefixesToCheck) {
    try {
      const groups = await collectPages(
        paginateDescribeLogGroups(
          { client: cloudWatchLogs },
          { logGroupNamePrefix: prefix },
        ),
        (page) => page.logGroups,
      );
      for (const group of groups) {
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
    } catch (error) {
      // A missing log group for a prefix is an empty page, not an error.
      noteLookupFailure(clients, "CloudWatch DescribeLogGroups", error);
    }
  }

  return resources;
}
