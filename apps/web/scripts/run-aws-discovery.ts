/**
 * Operational CLI for running discovery without a browser session.
 * Usage: ts-node -r tsconfig-paths/register scripts/run-aws-discovery.ts <connection-id>
 */

import { db, awsDiscoveryConnections } from "@db";
import { eq } from "drizzle-orm";
import { runDiscoveryScan } from "@/lib/server/aws/discovery-orchestrator";
import { resolveDiscoveryRegions } from "@/lib/server/aws/regions";
import { discoverAgentCoreRuntimes } from "@/lib/server/aws/discovery/agentCore";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: "../.env", quiet: true });

async function main() {
  const connectionId = process.argv[2];
  if (!connectionId) {
    throw new Error("AWS discovery connection ID is required");
  }

  const connection = await db.query.awsDiscoveryConnections.findFirst({
    where: eq(awsDiscoveryConnections.id, connectionId),
  });
  if (!connection) throw new Error("AWS discovery connection not found");

  const regionResolution = await resolveDiscoveryRegions({
    authMethod: connection.authMethod,
    region: connection.region,
    roleArn: connection.roleArn,
    externalId: connection.externalId,
    crossAccountRoleArn: connection.crossAccountRoleArn,
    encryptedAccessKeyId: connection.encryptedAccessKeyId,
    encryptedSecretAccessKey: connection.encryptedSecretAccessKey,
  });
  process.stdout.write(
    `${JSON.stringify({
      regionsScanned: regionResolution.regions,
      regionWarning: regionResolution.warning,
    })}\n`
  );
  if (process.argv.includes("--agentcore-test")) {
    try {
      const runtimes = await discoverAgentCoreRuntimes(
        connection.region,
        regionResolution.credentials
      );
      process.stdout.write(
        `${JSON.stringify({ agentCoreRuntimes: runtimes.length })}\n`
      );
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          agentCoreError:
            error instanceof Error ? error.message : "Unknown AgentCore error",
        })}\n`
      );
    }
  }
  if (process.argv.includes("--regions-only")) process.exit(0);

  const result = await runDiscoveryScan(
    connection.tenantId,
    connection.id,
    {
      authMethod: connection.authMethod,
      region: connection.region,
      roleArn: connection.roleArn,
      externalId: connection.externalId,
      crossAccountRoleArn: connection.crossAccountRoleArn,
      encryptedAccessKeyId: connection.encryptedAccessKeyId,
      encryptedSecretAccessKey: connection.encryptedSecretAccessKey,
    },
    null
  );

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.status === "completed" ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unknown discovery error"}\n`
  );
  process.exit(1);
});
