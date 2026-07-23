/**
 * Inspects IAM roles referenced by already-discovered resources (a Bedrock
 * Agent's execution role, a Lambda's execution role, etc). Extracts the
 * permission facts the Capability/Risk engines need — admin access,
 * write/delete/invoke actions, cross-account trust — directly from the
 * role's actual policy documents, not guessed from the role name.
 */

import {
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  GetRolePolicyCommand,
  GetPolicyCommand,
  GetPolicyVersionCommand,
} from "@aws-sdk/client-iam";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

interface PolicyStatement {
  Effect?: string;
  Action?: string | string[];
  Resource?: string | string[];
}

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function actionsFromDocument(doc: unknown): string[] {
  const statements: PolicyStatement[] =
    (doc as { Statement?: PolicyStatement | PolicyStatement[] })?.Statement
      ? Array.isArray((doc as { Statement: PolicyStatement | PolicyStatement[] }).Statement)
        ? ((doc as { Statement: PolicyStatement[] }).Statement)
        : [(doc as { Statement: PolicyStatement }).Statement]
      : [];
  return statements
    .filter((s) => s.Effect === "Allow")
    .flatMap((s) => asArray(s.Action));
}

function roleArnToName(arn: string): string | null {
  const match = arn.match(/role\/([^/]+)$/);
  return match ? match[1] : null;
}

export async function discoverIamRoles(
  clients: AwsClientBundle,
  roleArns: Set<string>
): Promise<RawDiscoveredResource[]> {
  const resources: RawDiscoveredResource[] = [];
  const { iam, region } = clients;

  for (const roleArn of roleArns) {
    const roleName = roleArnToName(roleArn);
    if (!roleName) continue;

    try {
      const role = await iam.send(new GetRoleCommand({ RoleName: roleName }));
      const allActions: string[] = [];

      // Inline policies
      const inline = await iam.send(
        new ListRolePoliciesCommand({ RoleName: roleName })
      );
      for (const policyName of inline.PolicyNames ?? []) {
        const detail = await iam.send(
          new GetRolePolicyCommand({ RoleName: roleName, PolicyName: policyName })
        );
        if (detail.PolicyDocument) {
          const doc = JSON.parse(decodeURIComponent(detail.PolicyDocument));
          allActions.push(...actionsFromDocument(doc));
        }
      }

      // Attached managed policies
      const attached = await iam.send(
        new ListAttachedRolePoliciesCommand({ RoleName: roleName })
      );
      for (const policy of attached.AttachedPolicies ?? []) {
        if (!policy.PolicyArn) continue;
        try {
          const policyMeta = await iam.send(
            new GetPolicyCommand({ PolicyArn: policy.PolicyArn })
          );
          const versionId = policyMeta.Policy?.DefaultVersionId;
          if (!versionId) continue;
          const version = await iam.send(
            new GetPolicyVersionCommand({
              PolicyArn: policy.PolicyArn,
              VersionId: versionId,
            })
          );
          if (version.PolicyVersion?.Document) {
            const doc = JSON.parse(
              decodeURIComponent(version.PolicyVersion.Document)
            );
            allActions.push(...actionsFromDocument(doc));
          }
        } catch {
          // an inaccessible managed policy shouldn't fail the whole role
        }
      }

      const lowerActions = allActions.map((a) => a.toLowerCase());
      const hasWildcardAction = lowerActions.includes("*");
      const hasAdminPolicy =
        (attached.AttachedPolicies ?? []).some(
          (p) => p.PolicyName === "AdministratorAccess"
        ) || hasWildcardAction;
      const hasWrite = lowerActions.some((a) => /:(put|create|update)/.test(a));
      const hasDelete = lowerActions.some((a) => /:delete/.test(a));
      const hasInvoke = lowerActions.some((a) => /:invoke/.test(a));

      let hasCrossAccountTrust = false;
      try {
        const trust = role.Role?.AssumeRolePolicyDocument
          ? JSON.parse(decodeURIComponent(role.Role.AssumeRolePolicyDocument))
          : null;
        const statements: PolicyStatement[] = trust?.Statement
          ? Array.isArray(trust.Statement)
            ? trust.Statement
            : [trust.Statement]
          : [];
        hasCrossAccountTrust = statements.some((s: any) => {
          const principal = s.Principal?.AWS;
          const principals = Array.isArray(principal) ? principal : [principal];
          return principals.some(
            (p: string) => typeof p === "string" && p !== "*" && /^\d{12}$|arn:aws:iam::\d{12}/.test(p)
          );
        });
      } catch {
        // best-effort trust policy parsing
      }

      resources.push({
        resourceType: "iam_role",
        resourceId: roleName,
        resourceArn: roleArn,
        resourceName: roleName,
        region,
        tags: {},
        createdAt: role.Role?.CreateDate?.toISOString?.() ?? null,
        metadata: {
          hasAdminPolicy,
          hasWrite,
          hasDelete,
          hasInvoke,
          hasCrossAccountTrust,
          actionCount: allActions.length,
          lastUsedDate: role.Role?.RoleLastUsed?.LastUsedDate?.toISOString?.() ?? null,
        },
      });
    } catch {
      // an inaccessible/deleted role shouldn't fail the whole scan
    }
  }

  return resources;
}
