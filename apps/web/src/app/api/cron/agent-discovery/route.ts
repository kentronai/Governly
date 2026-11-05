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
import { runDatabricksDiscoveryScan } from "@/lib/server/databricks/discovery-orchestrator";
import { runCrewAIDiscoveryScan } from "@/lib/server/crewai/discovery-orchestrator";
import { runGithubDiscoveryScan } from "@/lib/server/github/discovery-orchestrator";
import { isGithubProviderKey } from "@/lib/integrations/categories";
import { alignAutonomyByIdentity } from "@/lib/server/agents/autonomy-alignment";

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

let discoveryRunInProgress = false;

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
  if (discoveryRunInProgress) {
    return NextResponse.json(
      {
        status: "already_running",
        message: "A recurring discovery run is already in progress",
      },
      { status: 409 },
    );
  }

  discoveryRunInProgress = true;
  try {
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
    // GitHub last: it links each repository to the cloud agents scanned above.
    const isGithub = (i: (typeof enabled)[number]) =>
      isGithubProviderKey(i.nangoProviderConfigKey);
    for (const integration of [
      ...enabled.filter((i) => !isGithub(i)),
      ...enabled.filter(isGithub),
    ]) {
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
          const connection = await db.query.azureDiscoveryConnections.findFirst(
            {
              where: and(
                eq(
                  azureDiscoveryConnections.id,
                  configuration.azureConnectionId,
                ),
                eq(azureDiscoveryConnections.tenantId, integration.tenantId),
                eq(azureDiscoveryConnections.isEnabled, true),
              ),
            },
          );
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
          (integration.credentialsEncrypted || integration.nangoConnectionId)
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
        } else if (
          integration.name === "Databricks Unity Catalog" &&
          (integration.credentialsEncrypted || integration.nangoConnectionId)
        ) {
          results.push({
            integrationId: integration.id,
            provider: "Databricks Unity Catalog",
            ...(await runDatabricksDiscoveryScan(
              integration.tenantId,
              integration.id,
              integration,
              null,
            )),
          });
        } else if (isGithub(integration) && integration.nangoConnectionId) {
          results.push({
            integrationId: integration.id,
            provider: "GitHub",
            ...(await runGithubDiscoveryScan(
              integration.tenantId,
              integration.id,
              integration,
              null,
            )),
          });
        } else if (
          integration.name === "CrewAI" &&
          (integration.credentialsEncrypted || integration.nangoConnectionId)
        ) {
          results.push({
            integrationId: integration.id,
            provider: "CrewAI",
            ...(await runCrewAIDiscoveryScan(
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
            error instanceof Error
              ? error.message
              : "Scheduled discovery failed",
        });
      }
    }

    // Once every provider has been refreshed, align the autonomy of agents that
    // are the same logical agent deployed across platforms.
    for (const tenantId of new Set(enabled.map((i) => i.tenantId))) {
      try {
        await alignAutonomyByIdentity(tenantId);
      } catch {
        // Non-fatal: normalization is a display refinement, not core discovery.
      }
    }

    return NextResponse.json({
      completedAt: new Date().toISOString(),
      integrationsScanned: results.length,
      results,
    });
  } finally {
    discoveryRunInProgress = false;
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
