/**
 * Discovers EC2 instances that explicitly identify themselves as AI agents.
 *
 * Cloud inventory cannot prove what arbitrary code inside a VM does. NORIX
 * therefore only registers EC2 instances with an auditable agent signal in
 * their name or tags. Untagged workloads can register through the universal
 * agent-discovery ingestion endpoint.
 */

import {
  DescribeInstanceAttributeCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";
import { GetInstanceProfileCommand } from "@aws-sdk/client-iam";
import { analyzeStartupScript } from "../../agents/agent-profile";
import { inspectEcrImage, parseEcrRef, type ImageFacts } from "./ecr-image";
import { lastDeployer } from "./cloudtrail";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";
import { hasAgentSignal } from "./ec2-signals";

const MAX_USER_DATA_CHARS = 64_000;

/** True when AWS refused the call for lack of IAM permission (vs. a missing resource). */
export const isDenied = (e: unknown) =>
  /AccessDenied|UnauthorizedOperation|UnauthorizedAccess|not authorized/i.test(
    `${(e as { name?: string })?.name ?? ""} ${(e as { message?: string })?.message ?? ""}`,
  );

/** Startup-script facts (framework packages, models, env names). Needs ec2:DescribeInstanceAttribute. */
async function readUserData(clients: AwsClientBundle, instanceId: string, gaps: string[]) {
  try {
    const res = await clients.ec2.send(
      new DescribeInstanceAttributeCommand({ InstanceId: instanceId, Attribute: "userData" }),
    );
    const b64 = res.UserData?.Value;
    if (!b64) return {};
    const facts = analyzeStartupScript(
      Buffer.from(b64, "base64").toString("utf8").slice(0, MAX_USER_DATA_CHARS),
    );
    return {
      codePackages: facts.packages,
      codeModelIds: facts.modelIds,
      codeEnvKeys: facts.envKeys,
      codeProviders: facts.providers,
    };
  } catch (e) {
    if (isDenied(e)) gaps.push("ec2:DescribeInstanceAttribute");
    return {};
  }
}

/** Instance profile ARN -> the role it carries, so IAM discovery can read what the VM may access. Needs iam:GetInstanceProfile. */
async function roleOfProfile(clients: AwsClientBundle, profileArn: string | undefined, gaps: string[]) {
  const name = profileArn?.split("/").pop();
  if (!name) return null;
  try {
    const res = await clients.iam.send(new GetInstanceProfileCommand({ InstanceProfileName: name }));
    return res.InstanceProfile?.Roles?.[0]?.Arn ?? null;
  } catch (e) {
    if (isDenied(e)) gaps.push("iam:GetInstanceProfile");
    return null;
  }
}

/**
 * The ECR images the startup script runs hold the agent itself: read them for
 * skills, packages, models, runtime and repo, merged with the script's facts.
 */
async function readImages(
  clients: AwsClientBundle,
  userData: Record<string, unknown>,
  gaps: string[],
): Promise<Record<string, unknown>> {
  const refs = ((userData.codePackages as { name: string }[] | undefined) ?? [])
    .map((p) => p.name.replace(/^image:/, ""))
    .filter((ref) => parseEcrRef(ref))
    .slice(0, 4);
  const all: ImageFacts[] = [];
  for (const ref of refs) {
    const facts = await inspectEcrImage(clients.ecr, ref, gaps);
    if (facts) all.push(facts);
  }
  if (!all.length) return {};
  const flat = <K extends keyof ImageFacts>(k: K) => all.flatMap((f) => f[k] as unknown[]);
  return {
    codePackages: [...((userData.codePackages as unknown[]) ?? []), ...flat("codePackages")],
    codeTools: flat("codeTools"),
    codeModelIds: [...((userData.codeModelIds as unknown[]) ?? []), ...flat("codeModelIds")],
    codeEnvKeys: [...((userData.codeEnvKeys as unknown[]) ?? []), ...flat("codeEnvKeys")],
    codeProviders: [...((userData.codeProviders as unknown[]) ?? []), ...flat("codeProviders")],
    codeSkills: flat("codeSkills"),
    codeApps: flat("codeApps"),
    codeFrameworks: flat("codeFrameworks"),
    codeRepository: all.find((f) => f.codeRepository)?.codeRepository ?? null,
    codeImagePushedAt: all.map((f) => f.codeImagePushedAt).filter(Boolean).sort().pop() ?? null,
  };
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

        const gaps: string[] = [];
        const userData = await readUserData(clients, instance.InstanceId, gaps);
        const linkedRoleArn = await roleOfProfile(clients, instance.IamInstanceProfile?.Arn, gaps);
        const imageFacts = await readImages(clients, userData, gaps);
        const deployer = await lastDeployer(clients.cloudtrail, instance.InstanceId, gaps);

        resources.push({
          resourceType: "ec2_instance",
          resourceId: instance.InstanceId,
          resourceArn: `arn:aws:ec2:${clients.region}:${clients.accountId}:instance/${instance.InstanceId}`,
          resourceName: name,
          region: clients.region,
          tags,
          linkedRoleArn,
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
            ...userData,
            ...imageFacts,
            ...(deployer ?? {}),
            ...(gaps.length ? { permissionGaps: gaps } : {}),
            discoveryQualification:
              "Name or tags explicitly identify this compute workload as an AI agent.",
          },
        });
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  // Hosts deployed together by one app (same SST app+stage or CloudFormation
  // stack), e.g. an agent and the sandbox it runs code in, share the app's LLMs.
  const appKey = (t: Record<string, string>) =>
    t["sst:app"] ? `sst:${t["sst:app"]}/${t["sst:stage"] ?? ""}` : t["aws:cloudformation:stack-name"] ?? null;
  for (const r of resources) {
    const key = appKey(r.tags);
    if (!key || (r.metadata.codeModelIds as unknown[] | undefined)?.length) continue;
    const sibling = resources.find(
      (o) => o !== r && appKey(o.tags) === key && (o.metadata.codeModelIds as unknown[] | undefined)?.length,
    );
    if (sibling) {
      r.metadata.appModelIds = sibling.metadata.codeModelIds;
      r.metadata.llmsVia = sibling.resourceName;
    }
  }

  return resources;
}
