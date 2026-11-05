/**
 * Discovers Secrets Manager secrets referenced by an AI Lambda's
 * environment variables (by name/ARN match) — the "AI credentials" the
 * spec asks for, tied to a real resource reference rather than guessed.
 */

import { ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
import type { AwsClientBundle } from "../client-factory";
import type { RawDiscoveredResource } from "./types";

export async function discoverSecretsManagerSecrets(
  clients: AwsClientBundle,
  referencedSecretIds: Set<string>,
): Promise<RawDiscoveredResource[]> {
  if (referencedSecretIds.size === 0) return [];
  const resources: RawDiscoveredResource[] = [];
  const { secretsManager, region } = clients;

  let nextToken: string | undefined;
  do {
    const page = await secretsManager.send(
      new ListSecretsCommand({ NextToken: nextToken }),
    );
    for (const secret of page.SecretList ?? []) {
      if (!secret.Name || !secret.ARN) continue;
      const isReferenced = Array.from(referencedSecretIds).some(
        (ref) =>
          secret.Name === ref ||
          secret.ARN === ref ||
          secret.ARN?.includes(ref),
      );
      if (!isReferenced) continue;

      resources.push({
        resourceType: "secrets_manager_secret",
        resourceId: secret.Name,
        resourceArn: secret.ARN,
        resourceName: secret.Name,
        region,
        tags: Object.fromEntries(
          (secret.Tags ?? []).map((t) => [t.Key ?? "", t.Value ?? ""]),
        ),
        createdAt: secret.CreatedDate?.toISOString?.() ?? null,
        lastUpdatedAt: secret.LastChangedDate?.toISOString?.() ?? null,
        metadata: {
          lastAccessedDate: secret.LastAccessedDate?.toISOString?.() ?? null,
          rotationEnabled: secret.RotationEnabled ?? false,
        },
      });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return resources;
}
