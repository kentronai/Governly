/**
 * Server actions for the AWS integration (Admin -> Integrations -> AWS,
 * a normal card in the Cloud Providers category of the Integration
 * Marketplace). Discovery/autonomy/risk/ownership are capabilities of this
 * integration, not a separate module or page.
 */

"use server";

import { db, awsDiscoveryConnections, integrations, tenants } from "@db";
import { eq, and } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAuditEvent } from "@/lib/server/audit";
import { encryptSecret, maskSecret } from "@/lib/server/crypto";
import { getConnectionCredentials } from "@/lib/server/nango/client";
import { testAwsConnection } from "@/lib/server/aws/client-factory";

/** Reads the first non-empty string across credential/connection-config keys. */
function pickAwsCredential(
  credentials: Record<string, unknown>,
  connectionConfig: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = credentials[key] ?? connectionConfig[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function resolveTenantId(tenantSlugOrId: string): Promise<string> {
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  return tenantRow[0].id;
}

export interface CreateAwsConnectionInput {
  tenantSlug: string;
  name: string;
  authMethod: "iam_role" | "access_key" | "cross_account";
  region: string;
  roleArn?: string;
  externalId?: string;
  crossAccountRoleArn?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

function maskedConnection<T extends { encryptedAccessKeyId: string | null }>(
  row: T,
): Omit<T, "encryptedAccessKeyId" | "encryptedSecretAccessKey"> & {
  accessKeyIdMasked: string | null;
} {
  const { encryptedAccessKeyId, ...rest } = row as any;
  return {
    ...rest,
    accessKeyIdMasked: encryptedAccessKeyId ? "••••••••" : null,
  };
}

export const getAwsConnections = async (tenantSlugOrId: string) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  const rows = await db
    .select()
    .from(awsDiscoveryConnections)
    .where(eq(awsDiscoveryConnections.tenantId, tenantId))
    .orderBy(awsDiscoveryConnections.createdAt);

  return rows.map(maskedConnection);
};

export const createAwsConnection = async (input: CreateAwsConnectionInput) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(input.tenantSlug);

  if (
    input.authMethod === "access_key" &&
    (!input.accessKeyId || !input.secretAccessKey)
  ) {
    throw new Error(
      "Access Key + Secret are required for the access_key auth method.",
    );
  }
  if (input.authMethod === "iam_role" && !input.roleArn) {
    throw new Error("Role ARN is required for the iam_role auth method.");
  }
  if (input.authMethod === "cross_account" && !input.crossAccountRoleArn) {
    throw new Error(
      "Cross-account role ARN is required for the cross_account auth method.",
    );
  }

  const [row] = await db
    .insert(awsDiscoveryConnections)
    .values({
      tenantId,
      name: input.name,
      authMethod: input.authMethod,
      region: input.region,
      roleArn: input.roleArn ?? null,
      externalId: input.externalId ? encryptSecret(input.externalId) : null,
      crossAccountRoleArn: input.crossAccountRoleArn ?? null,
      encryptedAccessKeyId: input.accessKeyId
        ? encryptSecret(input.accessKeyId)
        : null,
      encryptedSecretAccessKey: input.secretAccessKey
        ? encryptSecret(input.secretAccessKey)
        : null,
      createdBy: userId,
    })
    .returning();

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "aws_connection.created",
    targetType: "aws_discovery_connection",
    targetId: row.id,
    metadata: {
      name: input.name,
      authMethod: input.authMethod,
      region: input.region,
    },
  });

  revalidatePath(`/${input.tenantSlug}/admin/integrations`);
  return maskedConnection(row);
};

/**
 * Bridge a Nango-authorized AWS account into the discovery model. After the
 * Nango Connect popup, the webhook records the connection on the integration
 * row; this reads the AWS auth details back from the Nango vault and upserts the
 * `awsDiscoveryConnections` row the existing discovery engine runs on, so AWS
 * joins the uniform Nango popup flow without changing discovery itself.
 *
 * Expected Nango `aws` credentials (custom/API-key config): `authMethod`,
 * `region`, and — per method — `roleArn` / `crossAccountRoleArn` + `externalId`
 * / `accessKeyId` + `secretAccessKey`. `iam_role` needs no secret (STS
 * AssumeRole uses NORIX's own identity); Nango stores only the role/region.
 */
export const syncAwsConnectionFromNango = async (
  tenantSlugOrId: string,
  integrationId: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  const integration = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.id, integrationId),
      eq(integrations.tenantId, tenantId),
    ),
  });
  if (!integration || integration.name !== "AWS") {
    throw new Error("AWS integration not found");
  }
  if (!integration.nangoConnectionId || !integration.nangoProviderConfigKey) {
    throw new Error("AWS account is not connected through Nango yet");
  }
  const { credentials, connectionConfig } = await getConnectionCredentials(
    integration.nangoConnectionId,
    integration.nangoProviderConfigKey,
  );
  const rawMethod = pickAwsCredential(
    credentials,
    connectionConfig,
    "authMethod",
    "auth_method",
  );
  const region =
    pickAwsCredential(credentials, connectionConfig, "region") || "us-east-1";
  const roleArn = pickAwsCredential(
    credentials,
    connectionConfig,
    "roleArn",
    "role_arn",
  );
  const crossAccountRoleArn = pickAwsCredential(
    credentials,
    connectionConfig,
    "crossAccountRoleArn",
    "cross_account_role_arn",
  );
  const externalId = pickAwsCredential(
    credentials,
    connectionConfig,
    "externalId",
    "external_id",
  );
  // Nango's `aws-iam` provider (auth_mode BASIC) stores the key pair as
  // username/password — the Connect popup's field titles are "AWS Access Key
  // ID" / "AWS Secret Access Key". Read those shapes in addition to the
  // explicit key names a custom config might use.
  const accessKeyId = pickAwsCredential(
    credentials,
    connectionConfig,
    "accessKeyId",
    "access_key_id",
    "username",
  );
  const secretAccessKey = pickAwsCredential(
    credentials,
    connectionConfig,
    "secretAccessKey",
    "secret_access_key",
    "apiKey",
    "password",
  );
  // Infer the auth method from the credential fields actually present instead
  // of defaulting to iam_role: an aws-iam popup connection carries only the
  // key pair, and assuming iam_role made every such connection fail on a
  // missing role ARN.
  const authMethod: "iam_role" | "access_key" | "cross_account" =
    rawMethod === "access_key" ||
    rawMethod === "cross_account" ||
    rawMethod === "iam_role"
      ? rawMethod
      : roleArn
        ? "iam_role"
        : crossAccountRoleArn
          ? "cross_account"
          : accessKeyId && secretAccessKey
            ? "access_key"
            : "iam_role";
  const reconnectHint =
    "The authorized AWS account is missing the discovery fields NORIX needs (auth method, region, role ARN or access keys). Revoke this integration, click Connect, and enter the AWS credentials in the form.";
  if (authMethod === "access_key" && (!accessKeyId || !secretAccessKey)) {
    throw new Error(reconnectHint);
  }
  if (authMethod === "iam_role" && !roleArn) {
    throw new Error(reconnectHint);
  }
  if (authMethod === "cross_account" && !crossAccountRoleArn) {
    throw new Error(reconnectHint);
  }
  const values = {
    name: "AWS",
    authMethod,
    region,
    roleArn: roleArn || null,
    externalId: externalId ? encryptSecret(externalId) : null,
    crossAccountRoleArn: crossAccountRoleArn || null,
    encryptedAccessKeyId: accessKeyId ? encryptSecret(accessKeyId) : null,
    encryptedSecretAccessKey: secretAccessKey
      ? encryptSecret(secretAccessKey)
      : null,
    updatedBy: userId,
    updatedAt: new Date().toISOString(),
  };
  const existingId = (integration.configuration as { awsConnectionId?: string })
    ?.awsConnectionId;
  let row: typeof awsDiscoveryConnections.$inferSelect | undefined;
  if (existingId) {
    [row] = await db
      .update(awsDiscoveryConnections)
      .set(values)
      .where(
        and(
          eq(awsDiscoveryConnections.id, existingId),
          eq(awsDiscoveryConnections.tenantId, tenantId),
        ),
      )
      .returning();
  }
  if (!row) {
    [row] = await db
      .insert(awsDiscoveryConnections)
      .values({ tenantId, ...values, createdBy: userId })
      .returning();
  }
  await db
    .update(integrations)
    .set({
      configuration: {
        ...((integration.configuration as Record<string, unknown>) ?? {}),
        awsConnectionId: row.id,
        authMethod,
        region,
      },
      isCredentialsAdded: true,
      isEnabled: true,
      errorMessage: null,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, integrationId));
  return { awsConnectionId: row.id };
};

export const deleteAwsConnection = async (
  tenantSlugOrId: string,
  id: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  await db
    .delete(awsDiscoveryConnections)
    .where(
      and(
        eq(awsDiscoveryConnections.id, id),
        eq(awsDiscoveryConnections.tenantId, tenantId),
      ),
    );

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "aws_connection.deleted",
    targetType: "aws_discovery_connection",
    targetId: id,
  });

  revalidatePath(`/${tenantSlugOrId}/admin/integrations`);
};

export const testAwsIntegrationConnection = async (
  tenantSlugOrId: string,
  id: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  const row = await db.query.awsDiscoveryConnections.findFirst({
    where: and(
      eq(awsDiscoveryConnections.id, id),
      eq(awsDiscoveryConnections.tenantId, tenantId),
    ),
  });
  if (!row) throw new Error("Connection not found");

  const result = await testAwsConnection({
    authMethod: row.authMethod,
    region: row.region,
    roleArn: row.roleArn,
    externalId: row.externalId,
    crossAccountRoleArn: row.crossAccountRoleArn,
    encryptedAccessKeyId: row.encryptedAccessKeyId,
    encryptedSecretAccessKey: row.encryptedSecretAccessKey,
  });

  await db
    .update(awsDiscoveryConnections)
    .set({
      lastValidatedAt: new Date().toISOString(),
      lastValidationError: result.ok ? null : result.error,
    })
    .where(eq(awsDiscoveryConnections.id, id));

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "aws_connection.tested",
    targetType: "aws_discovery_connection",
    targetId: id,
    metadata: result,
  });

  return result;
};

export { maskSecret };

// Ensures the "AWS" card exists in the generic Integration Marketplace
// (integrations table, category "cloud_providers") so it shows up as a
// normal card next to Slack/Jira/etc — no separate page or category.
// Idempotent: safe to call on every page load.
export const ensureAwsIntegrationCatalogEntry = async (
  tenantSlugOrId: string,
) => {
  const { userId } = await auth();
  if (!userId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);

  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, "AWS"),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(integrations)
      .set({
        description:
          "Discovers Bedrock, AgentCore, Lambda, and explicitly identified EC2 agent workloads across enabled AWS regions.",
        // Connected integrations are always active; the old separate
        // enable/disable control was intentionally removed from the UI.
        isEnabled: existing.isCredentialsAdded || existing.isEnabled,
        metadata: {
          ...(existing.metadata as Record<string, unknown>),
          logoUrl: "/logos/AWS.svg",
        },
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrations.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(integrations)
    .values({
      tenantId,
      name: "AWS",
      category: "cloud_providers",
      description:
        "Discovers Bedrock, AgentCore, Lambda, and explicitly identified EC2 agent workloads across enabled AWS regions.",
      configuration: {},
      metadata: { logoUrl: "/logos/AWS.svg" },
      isEnabled: false,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();

  return created;
};
