/**
 * Discovers EC2 instances that explicitly identify themselves as AI agents.
 *
 * Cloud inventory cannot prove what arbitrary code inside a VM does. NORIX
 * therefore only registers EC2 instances with an auditable agent signal in
 * their name or tags. Untagged workloads can register through the universal
 * agent-discovery ingestion endpoint.
 */

import { DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

const AI_SIGNAL =
  /(^|[-_:/.])(ai|agent|llm|genai|copilot|assistant|langchain|crewai|autogen)([-_:/.]|$)/i;
const SIGNAL_TAG_KEYS = new Set([
  "ai",
  "ai-agent",
  "agent",
  "norix:agent",
  "norix-agent",
  "workload-type",
]);

function hasAgentSignal(name: string, tags: Record<string, string>): boolean {
  if (AI_SIGNAL.test(name)) return true;
  return Object.entries(tags).some(
    ([key, value]) =>
      (SIGNAL_TAG_KEYS.has(key.toLowerCase()) || AI_SIGNAL.test(key)) &&
      value.toLowerCase() !== "false" &&
      value.toLowerCase() !== "disabled",
  );
}

export async function discoverEc2(
  clients: AwsClientBundle,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  let nextToken: string | undefined;

  do {
    const page = await clients.ec2.send(
      new DescribeInstancesCommand({
        NextToken: nextToken,
        Filters: [
          {
            Name: "instance-state-name",
            Values: ["pending", "running", "stopping", "stopped"],
          },
        ],
      }),
    );

    for (const reservation of page.Reservations ?? []) {
      for (const instance of reservation.Instances ?? []) {
        if (!instance.InstanceId) continue;
        const tags = Object.fromEntries(
          (instance.Tags ?? [])
            .filter((tag) => tag.Key && tag.Value !== undefined)
            .map((tag) => [tag.Key as string, tag.Value as string]),
        );
        const name = tags.Name || instance.InstanceId;
        if (!hasAgentSignal(name, tags)) continue;

        resources.push({
          resourceType: "ec2_instance",
          resourceId: instance.InstanceId,
          resourceArn: `arn:aws:ec2:${clients.region}:${clients.accountId}:instance/${instance.InstanceId}`,
          resourceName: name,
          region: clients.region,
          tags,
          createdAt: instance.LaunchTime?.toISOString() ?? null,
          metadata: {
            evidenceSource: "aws_ec2_describe_instances",
            instanceType: instance.InstanceType ?? null,
            state: instance.State?.Name ?? null,
            imageId: instance.ImageId ?? null,
            vpcId: instance.VpcId ?? null,
            subnetId: instance.SubnetId ?? null,
            privateIpAddress: instance.PrivateIpAddress ?? null,
            publicIpAddress: instance.PublicIpAddress ?? null,
            iamInstanceProfileArn: instance.IamInstanceProfile?.Arn ?? null,
            securityGroupIds: (instance.SecurityGroups ?? [])
              .map((group) => group.GroupId)
              .filter(Boolean),
            hasWrite: true,
            discoveryQualification:
              "Name or tags explicitly identify this compute workload as an AI agent.",
          },
        });
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return resources;
}
