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
import { alignAutonomyByIdentity } from "@/lib/server/agents/autonomy-alignment";
import { assignFallbackOwnership } from "@/lib/server/agents/ownership-fallback";

export async function refreshAgentInventory(tenantSlugOrId: string) {
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
  const tenantId = orgId;

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

  let agentsDiscovered = 0;
  const providers: string[] = [];

  for (const integration of enabled) {
    try {
      const config = (integration.configuration ?? {}) as Record<string, string>;
      let result: { agentsDiscovered?: number } | null = null;

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
        providers.push(integration.name);
        agentsDiscovered += Number(result.agentsDiscovered ?? 0);
      }
    } catch {
      // A single provider failing must not abort the whole refresh.
    }
  }

  // Post-discovery normalization: consistent autonomy + real owner fallback.
  await alignAutonomyByIdentity(tenantId);
  await assignFallbackOwnership(tenantId);

  for (const route of [
    "ai-agent-inventory",
    "ai-agent-discovery/dashboard",
    "admin/integrations",
  ]) {
    revalidatePath(`/${tenantSlugOrId}/${route}`);
  }

  return { providersScanned: providers, agentsDiscovered };
}
