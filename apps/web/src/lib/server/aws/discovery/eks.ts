/**
 * Discovers Amazon EKS (Elastic Kubernetes Service) clusters that explicitly
 * identify themselves as AI agents, mirroring how GCP surfaces GKE clusters and
 * Azure surfaces AKS clusters through the cloud connection.
 *
 * A cloud inventory entry cannot prove that everything running inside a cluster
 * is an agent, so — like EC2/VM/AKS/GKE anchors — NORIX only registers a cluster
 * whose name or tags carry an auditable agent signal. This lists the clusters
 * themselves (via the AWS EKS API); the workloads inside a cluster are out of
 * scope for cloud-credential discovery.
 */

import {
  ListClustersCommand,
  DescribeClusterCommand,
} from "@aws-sdk/client-eks";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";
import { hasAgentSignal } from "./ec2-signals";

export async function discoverEksClusters(
  clients: AwsClientBundle,
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];

  const names: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await clients.eks.send(
      new ListClustersCommand({ nextToken }),
    );
    names.push(...(page.clusters ?? []));
    nextToken = page.nextToken;
  } while (nextToken);

  for (const name of names) {
    const described = await clients.eks.send(
      new DescribeClusterCommand({ name }),
    );
    const cluster = described.cluster;
    if (!cluster?.name) continue;

    const tags = Object.fromEntries(
      Object.entries(cluster.tags ?? {}).filter(
        ([key, value]) => key && value !== undefined,
      ),
    ) as Record<string, string>;
    if (!hasAgentSignal(cluster.name, tags)) continue;

    resources.push({
      resourceType: "aws_eks_cluster",
      resourceId: cluster.name,
      resourceArn:
        cluster.arn ??
        `arn:aws:eks:${clients.region}:${clients.accountId}:cluster/${cluster.name}`,
      resourceName: cluster.name,
      region: clients.region,
      tags,
      createdAt: cluster.createdAt?.toISOString() ?? null,
      metadata: {
        evidenceSource: "aws_eks_describe_cluster",
        clusterVersion: cluster.version ?? null,
        status: cluster.status ?? null,
        endpoint: cluster.endpoint ?? null,
        roleArn: cluster.roleArn ?? null,
        platformVersion: cluster.platformVersion ?? null,
        endpointPublicAccess:
          cluster.resourcesVpcConfig?.endpointPublicAccess ?? null,
        endpointPrivateAccess:
          cluster.resourcesVpcConfig?.endpointPrivateAccess ?? null,
        hasWrite: true,
        discoveryQualification:
          "Name or tags explicitly identify this EKS cluster as an AI agent.",
      },
    });
  }

  return resources;
}
