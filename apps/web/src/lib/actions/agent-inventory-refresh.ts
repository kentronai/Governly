"use server";

/**
 * "Refresh" on the Agent Inventory: re-run discovery across every connected
 * provider for the tenant, then re-normalize (autonomy alignment + ownership
 * fallback), so a single click brings the whole inventory up to date in real
 * time instead of only re-reading stale rows.
 */

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  awsDiscoveryConnections,
  azureDiscoveryConnections,
  db,
  integrations,
  tenants,
} from "@db";
import { runDiscoveryScan } from "@/lib/server/aws/discovery-orchestrator";
import { runAzureDiscoveryScan } from "@/lib/server/azure/discovery-orchestrator";
import { runGoogleCloudDiscoveryScan } from "@/lib/server/gcp/discovery-orchestrator";
import { runDatabricksDiscoveryScan } from "@/lib/server/databricks/discovery-orchestrator";
import { runCrewAIDiscoveryScan } from "@/lib/server/crewai/discovery-orchestrator";
import { runGithubDiscoveryScan } from "@/lib/server/github/discovery-orchestrator";
import { isGithubProviderKey } from "@/lib/integrations/categories";
import { alignAutonomyByIdentity } from "@/lib/server/agents/autonomy-alignment";

export interface ProviderResult {
  name: string;
  ok: boolean;
  agents: number;
  error?: string;
}

export interface RefreshStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  results: ProviderResult[];
}

// The scan runs on the server, not inside the browser's request: leaving the page
// must not cancel it, and the page polls this to show progress when it comes back.
// ponytail: in-process, which is right for the single web container; move it to a
// table if the web tier ever scales out.
const jobs = new Map<string, RefreshStatus>();

async function authorizedTenantId(tenantSlugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  let rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!rows.length) {
    rows = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!rows.length || rows[0].id !== orgId) {
    throw new Error("Tenant access denied");
  }
  return { userId, tenantId: orgId };
}

/** Starts a refresh in the background (or joins the one already running). */
export async function refreshAgentInventory(
  tenantSlugOrId: string,
): Promise<RefreshStatus> {
  const { userId, tenantId } = await authorizedTenantId(tenantSlugOrId);
  const current = jobs.get(tenantId);
  if (current?.running) return current;

  const status: RefreshStatus = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: [],
  };
  jobs.set(tenantId, status);
  void runRefresh(tenantId, userId, tenantSlugOrId, status)
    .catch((e) => {
      status.results.push({
        name: "Refresh",
        ok: false,
        agents: 0,
        error: errorText(e),
      });
    })
    .finally(() => {
      status.running = false;
      status.finishedAt = new Date().toISOString();
    });
  return status;
}

export async function getAgentRefreshStatus(
  tenantSlugOrId: string,
): Promise<RefreshStatus> {
  const { tenantId } = await authorizedTenantId(tenantSlugOrId);
  return (
    jobs.get(tenantId) ?? {
      running: false,
      startedAt: null,
      finishedAt: null,
      results: [],
    }
  );
}

const errorText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 200);

async function runRefresh(
  tenantId: string,
  userId: string,
  tenantSlugOrId: string,
  status: RefreshStatus,
) {
  const enabled = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.isEnabled, true),
        eq(integrations.isCredentialsAdded, true),
      ),
    );

  const scan = async (integration: (typeof enabled)[number]) => {
    try {
      const config = (integration.configuration ?? {}) as Record<
        string,
        string
      >;
      let result: { agentsDiscovered?: number; status?: string; errorMessage?: string | null } | null = null;

      if (integration.name === "AWS" && config.awsConnectionId) {
        const connection = await db.query.awsDiscoveryConnections.findFirst({
          where: and(
            eq(awsDiscoveryConnections.id, config.awsConnectionId),
            eq(awsDiscoveryConnections.tenantId, tenantId),
            eq(awsDiscoveryConnections.isEnabled, true),
          ),
        });
        if (connection) {
          result = await runDiscoveryScan(
            tenantId,
            connection.id,
            connection,
            userId,
          );
        }
      } else if (integration.name === "Azure" && config.azureConnectionId) {
        const connection = await db.query.azureDiscoveryConnections.findFirst({
          where: and(
            eq(azureDiscoveryConnections.id, config.azureConnectionId),
            eq(azureDiscoveryConnections.tenantId, tenantId),
            eq(azureDiscoveryConnections.isEnabled, true),
          ),
        });
        if (connection) {
          result = await runAzureDiscoveryScan(
            tenantId,
            connection.id,
            connection,
            userId,
          );
        }
      } else if (
        integration.name === "Google Cloud" &&
        (integration.credentialsEncrypted || integration.nangoConnectionId)
      ) {
        result = await runGoogleCloudDiscoveryScan(
          tenantId,
          integration.id,
          integration,
          userId,
        );
      } else if (
        integration.name === "Databricks Unity Catalog" &&
        (integration.credentialsEncrypted || integration.nangoConnectionId)
      ) {
        result = await runDatabricksDiscoveryScan(
          tenantId,
          integration.id,
          integration,
          userId,
        );
      } else if (
        isGithubProviderKey(integration.nangoProviderConfigKey) &&
        integration.nangoConnectionId
      ) {
        result = await runGithubDiscoveryScan(
          tenantId,
          integration.id,
          integration,
          userId,
        );
      } else if (
        integration.name === "CrewAI" &&
        (integration.credentialsEncrypted || integration.nangoConnectionId)
      ) {
        result = await runCrewAIDiscoveryScan(
          tenantId,
          integration.id,
          integration,
          userId,
        );
      }

      if (result) {
        // Scanners report failure in their result rather than throwing.
        const failed = result.status === "failed";
        status.results.push({
          name: integration.name,
          ok: !failed,
          agents: Number(result.agentsDiscovered ?? 0),
          ...(failed ? { error: (result.errorMessage ?? "scan failed").slice(0, 200) } : {}),
        });
      }
    } catch (e) {
      // A single provider failing must not abort the whole refresh, but the
      // user is told which one failed and why.
      status.results.push({
        name: integration.name,
        ok: false,
        agents: 0,
        error: errorText(e),
      });
    }
  };

  // Providers are independent, so scan them concurrently — the refresh takes
  // as long as the slowest provider, not the sum. GitHub runs after, because it
  // links each repository to the cloud agent it is the source of.
  const isGithub = (i: (typeof enabled)[number]) =>
    isGithubProviderKey(i.nangoProviderConfigKey);
  await Promise.all(enabled.filter((i) => !isGithub(i)).map(scan));
  for (const integration of enabled.filter(isGithub)) await scan(integration);
  // GitHub has just found each repo's live site; AWS scans once more so an
  // instance serving that site links to its repo in this same refresh.
  if (enabled.some(isGithub)) {
    for (const integration of enabled.filter((i) => i.name === "AWS")) {
      status.results = status.results.filter((r) => r.name !== integration.name);
      await scan(integration);
    }
  }

  // Post-discovery normalization: consistent autonomy. Owners come only from
  // provider evidence (Owner/Email/Team tags); the user who connected an
  // integration is not assumed to own the resources it discovers.
  await alignAutonomyByIdentity(tenantId);

  try {
    for (const route of [
      "ai-agent-inventory",
      "ai-agent-discovery/dashboard",
      "admin/integrations",
    ]) {
      revalidatePath(`/${tenantSlugOrId}/${route}`);
    }
  } catch {
    // Outside the originating request the cache can't be revalidated; the page reloads its data itself.
  }
}
