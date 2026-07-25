/**
 * Builds authenticated AWS SDK clients for a stored discovery connection.
 *
 * Three auth methods, per the `aws_auth_method` enum:
 *  - iam_role: STS AssumeRole using this app's own AWS identity (no
 *    long-lived customer secret ever stored).
 *  - cross_account: STS AssumeRole with an External ID, into the
 *    customer's account.
 *  - access_key: static credentials, decrypted from the connection row.
 */

import {
  STSClient,
  AssumeRoleCommand,
  GetCallerIdentityCommand,
} from "@aws-sdk/client-sts";
import { BedrockClient } from "@aws-sdk/client-bedrock";
import { BedrockAgentClient } from "@aws-sdk/client-bedrock-agent";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { SFNClient } from "@aws-sdk/client-sfn";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { IAMClient } from "@aws-sdk/client-iam";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { EC2Client } from "@aws-sdk/client-ec2";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { decryptSecret } from "@/lib/server/crypto";

const AWS_MAX_ATTEMPTS = 3;
const AWS_REQUEST_HANDLER = new NodeHttpHandler({
  // 5s was not enough to complete a TLS handshake to geographically distant
  // regions from a container, so regions like eu-central-1 were dropped from
  // every scan with "the request socket did not establish a connection within
  // the configured timeout" and their resources silently went stale.
  connectionTimeout: 15_000,
  requestTimeout: 30_000,
});

export const awsDiscoveryClientConfig = {
  maxAttempts: AWS_MAX_ATTEMPTS,
  requestHandler: AWS_REQUEST_HANDLER,
} as const;

// Defined locally (rather than imported from @aws-sdk/types) since that
// package is a transitive dependency not hoisted into this workspace.
export interface AwsCredentialIdentity {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface DiscoveryConnectionRecord {
  authMethod: "iam_role" | "access_key" | "cross_account";
  region: string;
  roleArn: string | null;
  externalId: string | null;
  crossAccountRoleArn: string | null;
  encryptedAccessKeyId: string | null;
  encryptedSecretAccessKey: string | null;
}

export interface AwsClientBundle {
  region: string;
  accountId: string;
  bedrock: BedrockClient;
  bedrockAgent: BedrockAgentClient;
  lambda: LambdaClient;
  stepFunctions: SFNClient;
  cloudWatchLogs: CloudWatchLogsClient;
  iam: IAMClient;
  secretsManager: SecretsManagerClient;
  apiGateway: APIGatewayClient;
  apiGatewayV2: ApiGatewayV2Client;
  eventBridge: EventBridgeClient;
  ec2: EC2Client;
}

export async function resolveAwsCredentials(
  connection: DiscoveryConnectionRecord,
): Promise<AwsCredentialIdentity> {
  if (connection.authMethod === "access_key") {
    if (
      !connection.encryptedAccessKeyId ||
      !connection.encryptedSecretAccessKey
    ) {
      throw new Error("Access key connection is missing stored credentials.");
    }
    return {
      accessKeyId: decryptSecret(connection.encryptedAccessKeyId),
      secretAccessKey: decryptSecret(connection.encryptedSecretAccessKey),
    };
  }

  const roleArn =
    connection.authMethod === "cross_account"
      ? connection.crossAccountRoleArn
      : connection.roleArn;
  if (!roleArn) {
    throw new Error(
      `${connection.authMethod} connection is missing a role ARN to assume.`,
    );
  }

  const sts = new STSClient({
    region: connection.region || "us-east-1",
    ...awsDiscoveryClientConfig,
  });
  const assumed = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "norix-ai-agent-discovery",
      ExternalId: connection.externalId
        ? decryptSecret(connection.externalId)
        : undefined,
      DurationSeconds: 3600,
    }),
  );

  if (
    !assumed.Credentials?.AccessKeyId ||
    !assumed.Credentials?.SecretAccessKey
  ) {
    throw new Error("AssumeRole did not return usable credentials.");
  }

  return {
    accessKeyId: assumed.Credentials.AccessKeyId,
    secretAccessKey: assumed.Credentials.SecretAccessKey,
    sessionToken: assumed.Credentials.SessionToken,
  };
}

export async function buildAwsClients(
  connection: DiscoveryConnectionRecord,
  options: { region?: string; credentials?: AwsCredentialIdentity } = {},
): Promise<AwsClientBundle> {
  const credentials =
    options.credentials ?? (await resolveAwsCredentials(connection));
  const region = options.region ?? connection.region ?? "us-east-1";

  const sts = new STSClient({
    region,
    credentials,
    ...awsDiscoveryClientConfig,
  });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account ?? "unknown";

  return {
    region,
    accountId,
    bedrock: new BedrockClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    bedrockAgent: new BedrockAgentClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    lambda: new LambdaClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    stepFunctions: new SFNClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    cloudWatchLogs: new CloudWatchLogsClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    iam: new IAMClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    secretsManager: new SecretsManagerClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    apiGateway: new APIGatewayClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    apiGatewayV2: new ApiGatewayV2Client({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    eventBridge: new EventBridgeClient({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
    ec2: new EC2Client({
      region,
      credentials,
      ...awsDiscoveryClientConfig,
    }),
  };
}

// Used by the "Test Connection" button — cheaper than a full client bundle.
export async function testAwsConnection(
  connection: DiscoveryConnectionRecord,
): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  try {
    const credentials = await resolveAwsCredentials(connection);
    const sts = new STSClient({
      region: connection.region || "us-east-1",
      credentials,
      ...awsDiscoveryClientConfig,
    });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return { ok: true, accountId: identity.Account ?? "unknown" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown AWS error",
    };
  }
}
