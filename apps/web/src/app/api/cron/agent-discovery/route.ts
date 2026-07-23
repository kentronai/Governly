import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  awsDiscoveryConnections,
  azureDiscoveryConnections,
  db,
  integrations,
} from "@db";
import { runDiscoveryScan } from "@/lib/server/aws/discovery-orchestrator";
import { runAzureDiscoveryScan } from "@/lib/server/azure/discovery-orchestrator";
import { runGoogleCloudDiscoveryScan } from "@/lib/server/gcp/discovery-orchestrator";

function authorized(request: NextRequest): boolean {
  const expected =
    process.env.AGENT_DISCOVERY_CRON_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function run(request: NextRequest) {
  if (!process.env.AGENT_DISCOVERY_CRON_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Agent discovery cron secret is not configured" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.isEnabled, true),
        eq(integrations.isCredentialsAdded, true),
      ),
    );
  const results: Array<Record<string, unknown>> = [];

  // Run sequentially to avoid multiplying provider API rate limits and DB
  // engine work when multiple tenants are scheduled at the same time.
  for (const integration of enabled) {
    try {
      const configuration = (integration.configuration ?? {}) as Record<
        string,
        string
      >;
      if (integration.name === "AWS" && configuration.awsConnectionId) {
        const connection = await db.query.awsDiscoveryConnections.findFirst({
          where: and(
            eq(awsDiscoveryConnections.id, configuration.awsConnectionId),
            eq(awsDiscoveryConnections.tenantId, integration.tenantId),
            eq(awsDiscoveryConnections.isEnabled, true),
          ),
        });
        if (connection) {
          results.push({
            integrationId: integration.id,
            provider: "AWS",
            ...(await runDiscoveryScan(
              integration.tenantId,
              connection.id,
              connection,
              null,
            )),
          });
        }
      } else if (
        integration.name === "Azure" &&
        configuration.azureConnectionId
      ) {
        const connection = await db.query.azureDiscoveryConnections.findFirst({
          where: and(
            eq(azureDiscoveryConnections.id, configuration.azureConnectionId),
            eq(azureDiscoveryConnections.tenantId, integration.tenantId),
            eq(azureDiscoveryConnections.isEnabled, true),
          ),
        });
        if (connection) {
          results.push({
            integrationId: integration.id,
            provider: "Azure",
            ...(await runAzureDiscoveryScan(
              integration.tenantId,
              connection.id,
              connection,
              null,
            )),
          });
        }
      } else if (
        integration.name === "Google Cloud" &&
        integration.credentialsEncrypted
      ) {
        results.push({
          integrationId: integration.id,
          provider: "Google Cloud",
          ...(await runGoogleCloudDiscoveryScan(
            integration.tenantId,
            integration.id,
            integration,
            null,
          )),
        });
      }
    } catch (error) {
      results.push({
        integrationId: integration.id,
        provider: integration.name,
        status: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Scheduled discovery failed",
      });
    }
  }

  return NextResponse.json({
    completedAt: new Date().toISOString(),
    integrationsScanned: results.length,
    results,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
