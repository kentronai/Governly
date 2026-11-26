import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db, integrations, tenants } from "@db";
import { requireTenantMember } from "@/lib/server/tenant-access";
import {
  getConnection,
  deleteConnection,
  getConnectionCredentials,
  listConnections,
} from "@/lib/server/nango/client";
import { triggerManualScan } from "@/lib/actions/aws-discovery";
import {
  createAwsConnection,
  deleteAwsConnection,
  syncAwsConnectionFromNango,
  testAwsIntegrationConnection,
} from "@/lib/actions/aws-integration";
import {
  createAzureConnection,
  deleteAzureConnection,
  syncAzureConnectionFromNango,
  testAzureIntegrationConnection,
  triggerAzureDiscovery,
} from "@/lib/actions/azure-integration";
import {
  createGoogleCloudConnection,
  deleteGoogleCloudConnection,
  testGoogleCloudIntegrationConnection,
  triggerGoogleCloudDiscovery,
} from "@/lib/actions/gcp-integration";
import {
  createDatabricksConnection,
  deleteDatabricksConnection,
  testDatabricksIntegrationConnection,
  triggerDatabricksDiscovery,
} from "@/lib/actions/databricks-integration";
import {
  createCrewAIConnection,
  deleteCrewAIConnection,
  testCrewAIIntegrationConnection,
  triggerCrewAIDiscovery,
} from "@/lib/actions/crewai-integration";
import { triggerGithubDiscovery } from "@/lib/actions/github-integration";
import { isGithubProviderKey } from "@/lib/integrations/categories";
import {
  createLangSmithConnection,
  deleteLangSmithConnection,
  listLangSmithIntegrationProjects,
  setLangSmithProject,
  testLangSmithIntegrationConnection,
  triggerLangSmithSync,
} from "@/lib/actions/langsmith-integration";
import {
  clearIntegrationCredentials,
  saveEncryptedIntegrationCredentials,
  updateIntegration,
} from "@/lib/actions/integrations";
import { disconnectNango } from "@/lib/actions/nango-connect";
import { pruneOrphanAgents } from "@/lib/server/agents/prune-orphans";
import { purgeRepoModelsIfGithubGone } from "@/lib/server/github/model-scan";

const DATABRICKS_UNITY_CATALOG = "Databricks Unity Catalog";
const CREWAI = "CrewAI";
const LANGSMITH = "LangSmith";

// Maps the marketplace integration name to the Nango provider-config key so the
// connection can be reconciled straight from Nango (see ensureNangoConnection).
const PROVIDER_NAME_TO_CONFIG_KEY: Record<string, string> = {
  AWS: "aws",
  Azure: "azure",
  "Google Cloud": "google",
  [DATABRICKS_UNITY_CATALOG]: "databricks",
  [CREWAI]: "crewai",
  [LANGSMITH]: "langsmith",
};

type Body = {
  action?: string;
  tenantSlugOrId?: string;
  tenantSlug?: string;
  integrationId?: string;
  providerName?: string;
  configuration?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  [key: string]: unknown;
};

function requiredString(body: Body, key: keyof Body) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${String(key)} is required`);
  }
  return value.trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveTenantId(tenantSlugOrId: string): Promise<string> {
  // Must be the caller's own org; never trust the tenant named in the body.
  return (await requireTenantMember(tenantSlugOrId)).tenantId;
}

/**
 * Persist a Nango connection reference onto the integration row and mark it
 * connected. Shared by both the webhook-driven path and the pull-based
 * reconcile so downstream discovery always finds a connection.
 */
async function persistNangoConnection(
  tenantId: string,
  integrationId: string,
  connectionId: string,
  providerConfigKey: string,
) {
  await db
    .update(integrations)
    .set({
      nangoConnectionId: connectionId,
      nangoProviderConfigKey: providerConfigKey,
      isCredentialsAdded: true,
      isEnabled: true,
      syncStatus: "pending",
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(eq(integrations.id, integrationId), eq(integrations.tenantId, tenantId)),
    );
  return {
    nangoConnectionId: connectionId,
    nangoProviderConfigKey: providerConfigKey,
  };
}

/**
 * Pull the just-authorized connection straight from Nango and record it, so
 * NORIX no longer depends on the connection webhook being delivered.
 *
 * Order of trust:
 *  1. A connectionId hint captured from the browser's Nango `connect` event —
 *     verified against Nango so a forged id can't be persisted.
 *  2. Nango's connection list scoped to this tenant (end user) + provider,
 *     newest first.
 */
async function reconcileFromNango(
  tenantId: string,
  integrationId: string,
  providerConfigKey: string,
  hintConnectionId?: string,
): Promise<{ nangoConnectionId: string; nangoProviderConfigKey: string } | null> {
  // A connection belongs to this tenant only if Nango attributes it to the tenant
  // (Connect sessions use endUserId = tenant id) or it was created by
  // connectViaNango, whose ids are "<tenantId>--<key>". Anything else may be
  // another tenant's credential and must never be bound here.
  const ownedByTenant = (item: { connectionId: string; endUserId?: string | null }) =>
    item.endUserId === tenantId || item.connectionId.startsWith(`${tenantId}--`);

  if (hintConnectionId) {
    try {
      const verified = hintConnectionId.startsWith(`${tenantId}--`)
        ? (await getConnection(hintConnectionId, providerConfigKey)).connectionId
        : (
            await listConnections({ connectionId: hintConnectionId, providerConfigKey })
          ).find((item) => item.connectionId === hintConnectionId && ownedByTenant(item))
            ?.connectionId;
      if (verified) {
        return persistNangoConnection(
          tenantId,
          integrationId,
          verified,
          providerConfigKey,
        );
      }
    } catch {
      // Fall through to the list-based lookup below.
    }
  }

  const pickNewest = (
    items: Awaited<ReturnType<typeof listConnections>>,
  ): string | undefined =>
    items
      .filter((item) => item.providerConfigKey === providerConfigKey)
      .filter(ownedByTenant)
      .sort((a, b) => {
        const at = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bt - at;
      })[0]?.connectionId;

  for (const params of [
    { endUserId: tenantId, providerConfigKey },
    { providerConfigKey },
  ]) {
    try {
      const connectionId = pickNewest(await listConnections(params));
      if (connectionId) {
        return persistNangoConnection(
          tenantId,
          integrationId,
          connectionId,
          providerConfigKey,
        );
      }
    } catch {
      // Try the next, less specific query before giving up.
    }
  }
  return null;
}

/**
 * Drop every trace of a provider connection: the provider's own connection row,
 * the Nango connection and the integration's credential state, then the agents
 * it discovered. Used by Revoke and to roll back a connect that failed, so the
 * card never says "Connected" for credentials NORIX cannot use.
 */
async function revokeConnection(
  tenant: string,
  integrationId: string,
  providerName: string,
  configuration: Record<string, unknown>,
) {
  if (providerName === "AWS") {
    const connectionId = configuration.awsConnectionId;
    if (typeof connectionId === "string" && connectionId) {
      await deleteAwsConnection(tenant, connectionId);
    }
    await disconnectNango({ tenantSlugOrId: tenant, integrationId });
  } else if (providerName === "Azure") {
    const connectionId = configuration.azureConnectionId;
    if (typeof connectionId === "string" && connectionId) {
      await deleteAzureConnection(tenant, connectionId);
    }
    await disconnectNango({ tenantSlugOrId: tenant, integrationId });
  } else if (providerName === "Google Cloud") {
    await deleteGoogleCloudConnection(tenant, integrationId);
  } else if (providerName === DATABRICKS_UNITY_CATALOG) {
    await deleteDatabricksConnection(tenant, integrationId);
  } else if (providerName === CREWAI) {
    await deleteCrewAIConnection(tenant, integrationId);
  } else if (providerName === LANGSMITH) {
    await deleteLangSmithConnection(tenant, integrationId);
  } else {
    // Nango-backed rows (e.g. GitHub PAT): drop the Nango connection and its
    // reference too, or the card keeps showing "Connected".
    await disconnectNango({ tenantSlugOrId: tenant, integrationId });
    await clearIntegrationCredentials(tenant, integrationId);
  }
  // Whatever the provider, its discovered agents go with it.
  const revokedTenantId = await resolveTenantId(tenant);
  await pruneOrphanAgents(revokedTenantId);
  // GitHub gone: its repo model detections go too (no-op while GitHub stays connected).
  await purgeRepoModelsIfGithubGone(revokedTenantId);
}

/**
 * Undo a half-finished connect, using the configuration the connect wrote.
 * The popup's own Nango connection is deleted too, even if NORIX never bound it
 * to the row, so failed attempts don't pile up as orphans in Nango.
 */
async function rollbackConnect(
  tenant: string,
  integrationId: string,
  providerName: string,
  providerConfigKey: string,
  hintConnectionId?: string,
) {
  if (hintConnectionId) {
    try {
      const tenantId = await resolveTenantId(tenant);
      const owned = await listConnections({
        connectionId: hintConnectionId,
        endUserId: tenantId,
        providerConfigKey,
      });
      if (owned.some((c) => c.connectionId === hintConnectionId && c.endUserId === tenantId)) {
        await deleteConnection(hintConnectionId, providerConfigKey);
      }
    } catch (error) {
      console.error("Deleting the failed Nango connection failed:", error);
    }
  }
  try {
    const tenantId = await resolveTenantId(tenant);
    const row = await db.query.integrations.findFirst({
      where: and(eq(integrations.tenantId, tenantId), eq(integrations.id, integrationId)),
      columns: { configuration: true },
    });
    await revokeConnection(
      tenant,
      integrationId,
      providerName,
      (row?.configuration as Record<string, unknown>) ?? {},
    );
  } catch (error) {
    console.error("Rolling back a failed connect failed:", error);
  }
}

/**
 * Guarantee the integration row carries a Nango connection reference before
 * discovery runs. Prefers what the webhook may have already written, otherwise
 * reconciles it directly from Nango (webhook-independent). Polls briefly so a
 * connection that is still settling in Nango is still picked up.
 */
async function ensureNangoConnection(
  tenantSlugOrId: string,
  integrationId: string,
  providerConfigKey: string,
  hintConnectionId?: string,
  timeoutMs = 45_000,
) {
  const tenantId = await resolveTenantId(tenantSlugOrId);
  const started = Date.now();
  let sawRow = false;

  do {
    const row = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.id, integrationId),
      ),
      columns: { nangoConnectionId: true, nangoProviderConfigKey: true },
    });
    sawRow = sawRow || Boolean(row);
    if (row?.nangoConnectionId && row.nangoProviderConfigKey) {
      return row;
    }

    const reconciled = await reconcileFromNango(
      tenantId,
      integrationId,
      providerConfigKey,
      hintConnectionId,
    );
    if (reconciled) return reconciled;

    if (Date.now() - started >= timeoutMs) break;
    await sleep(1_500);
  } while (Date.now() - started < timeoutMs);

  if (!sawRow) {
    throw new Error("Integration row was not found after Nango authorization");
  }
  throw new Error(
    "Account was authorized in Nango, but NORIX could not find the connection. Confirm NANGO_SECRET_KEY is set and this provider is configured in Nango, then click Discover.",
  );
}

/**
 * Persist non-secret provider settings the discovery engine needs from the
 * Nango connection config. The `databricks-workspace` popup collects the
 * workspace instance (dbc-….cloud.databricks.com); discovery must know it as
 * `configuration.hostUrl` to route API calls to the right workspace.
 */
async function syncNangoProviderSettings(
  tenantSlugOrId: string,
  integrationId: string,
  providerName: string,
) {
  if (providerName !== DATABRICKS_UNITY_CATALOG) return;
  const tenantId = await resolveTenantId(tenantSlugOrId);
  const row = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.id, integrationId),
    ),
    columns: {
      configuration: true,
      nangoConnectionId: true,
      nangoProviderConfigKey: true,
    },
  });
  if (!row?.nangoConnectionId || !row.nangoProviderConfigKey) return;
  const configuration = (row.configuration as Record<string, unknown>) ?? {};
  if (typeof configuration.hostUrl === "string" && configuration.hostUrl) {
    return;
  }
  const { connectionConfig } = await getConnectionCredentials(
    row.nangoConnectionId,
    row.nangoProviderConfigKey,
  );
  const instance = [
    connectionConfig.databricksInstance,
    connectionConfig.databricks_instance,
    connectionConfig.workspaceUrl,
    connectionConfig.instance,
  ].find((value): value is string => typeof value === "string" && !!value.trim());
  if (!instance) return;
  const hostUrl = instance.startsWith("http")
    ? instance.trim()
    : `https://${instance.trim()}`;
  await db
    .update(integrations)
    .set({
      configuration: { ...configuration, hostUrl, authentication: "nango" },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(integrations.id, integrationId));
}

async function runDiscovery(body: Body) {
  const tenant = requiredString(body, "tenantSlugOrId");
  const integrationId = requiredString(body, "integrationId");
  const providerName = requiredString(body, "providerName");
  const hintConnectionId =
    typeof body.connectionId === "string" && body.connectionId.trim()
      ? body.connectionId.trim()
      : undefined;
  const providerConfigKey = PROVIDER_NAME_TO_CONFIG_KEY[providerName];
  const latest = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenant),
      eq(integrations.id, integrationId),
    ),
    columns: {
      configuration: true,
      credentialsEncrypted: true,
      nangoConnectionId: true,
      nangoProviderConfigKey: true,
    },
  });
  const configuration =
    (latest?.configuration as Record<string, unknown> | null) ??
    body.configuration ??
    {};

  // GitHub rows are env-enabled providers (their name varies by flavour), so
  // they are recognised by the Nango provider key stored on the row.
  if (isGithubProviderKey(latest?.nangoProviderConfigKey)) {
    return triggerGithubDiscovery(tenant, integrationId);
  }

  // Make sure a Nango-backed provider has its connection reference recorded
  // before discovery reads it — reconciling from Nango when the webhook hasn't
  // (or won't) land. AWS/Azure keep their own discovery-connection rows, so
  // they reconcile only when that row hasn't been synced yet.
  const ensure = () =>
    providerConfigKey
      ? ensureNangoConnection(
          tenant,
          integrationId,
          providerConfigKey,
          hintConnectionId,
        )
      : Promise.resolve(undefined);

  if (providerName === "AWS") {
    let id = configuration.awsConnectionId;
    if (typeof id !== "string" || !id) {
      await ensure();
      const synced = await syncAwsConnectionFromNango(tenant, integrationId);
      id = synced.awsConnectionId;
    }
    if (typeof id !== "string" || !id) throw new Error("AWS connection is missing");
    return triggerManualScan(tenant, id);
  }
  if (providerName === "Azure") {
    let id = configuration.azureConnectionId;
    if (typeof id !== "string" || !id) {
      await ensure();
      const synced = await syncAzureConnectionFromNango(tenant, integrationId);
      id = synced.azureConnectionId;
    }
    if (typeof id !== "string" || !id) throw new Error("Azure connection is missing");
    return triggerAzureDiscovery(tenant, id);
  }

  // GCP / Databricks / CrewAI read their credential from Nango (or a legacy
  // encrypted secret). Reconcile the Nango reference first when neither is
  // present yet, so both auto-connect and the manual Discover button work.
  const hasCredential =
    Boolean(latest?.nangoConnectionId) || Boolean(latest?.credentialsEncrypted);
  if (!hasCredential) await ensure();
  await syncNangoProviderSettings(tenant, integrationId, providerName);

  if (providerName === "Google Cloud") {
    return triggerGoogleCloudDiscovery(tenant, integrationId);
  }
  if (providerName === DATABRICKS_UNITY_CATALOG) {
    return triggerDatabricksDiscovery(tenant, integrationId);
  }
  if (providerName === CREWAI) {
    return triggerCrewAIDiscovery(tenant, integrationId);
  }
  if (providerName === LANGSMITH) {
    return triggerLangSmithSync(tenant, integrationId);
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const action = requiredString(body, "action");
    const tenant = body.tenantSlugOrId || body.tenantSlug;
    if (typeof tenant !== "string" || !tenant.trim()) {
      throw new Error("tenantSlugOrId is required");
    }
    // Every action below acts on this tenant: the caller must belong to it.
    await requireTenantMember(tenant);

    if (action === "nangoConnected") {
      const integrationId = requiredString(body, "integrationId");
      const providerName = requiredString(body, "providerName");
      const knownKey = PROVIDER_NAME_TO_CONFIG_KEY[providerName];
      // Env-enabled providers have no built-in discovery: just record the connection.
      const providerConfigKey =
        knownKey ??
        (typeof body.providerConfigKey === "string" ? body.providerConfigKey.trim() : "");
      if (!providerConfigKey) {
        throw new Error(`Unsupported Nango provider: ${providerName}`);
      }
      const hintConnectionId =
        typeof body.connectionId === "string" && body.connectionId.trim()
          ? body.connectionId.trim()
          : undefined;
      // All or nothing: if NORIX cannot record or use the credentials just
      // entered, remove them again so the card goes back to "Not connected" with
      // the real error, instead of saying "Connected" for an account that
      // doesn't work (and blocking a fresh Connect).
      const connect = async (): Promise<unknown> => {
        // Record the connection straight from Nango (webhook-independent) before
        // any provider-specific discovery runs.
        await ensureNangoConnection(
          tenant,
          integrationId,
          providerConfigKey,
          hintConnectionId,
        );
        if (isGithubProviderKey(providerConfigKey)) {
          return triggerGithubDiscovery(tenant, integrationId);
        }
        if (!knownKey) return { status: "completed", agentsDiscovered: 0 };
        if (providerName === "AWS") {
          const { awsConnectionId } = await syncAwsConnectionFromNango(
            tenant,
            integrationId,
          );
          const tested = await testAwsIntegrationConnection(tenant, awsConnectionId);
          if (!tested.ok) throw new Error(tested.error);
          return triggerManualScan(tenant, awsConnectionId);
        }
        if (providerName === "Azure") {
          const { azureConnectionId } = await syncAzureConnectionFromNango(
            tenant,
            integrationId,
          );
          const tested = await testAzureIntegrationConnection(tenant, azureConnectionId);
          if (!tested.ok) throw new Error(tested.error);
          return triggerAzureDiscovery(tenant, azureConnectionId);
        }
        return runDiscovery(body);
      };
      // All or nothing: if NORIX cannot record or use the credentials just
      // entered, remove them again so the card goes back to "Not connected" with
      // the real error, instead of saying "Connected" for an account that
      // doesn't work (and blocking a fresh Connect).
      let result: unknown;
      try {
        result = await connect();
      } catch (error) {
        await rollbackConnect(tenant, integrationId, providerName, providerConfigKey, hintConnectionId);
        throw error;
      }
      const failed = result as { status?: string; errorMessage?: string } | undefined;
      if (failed?.status === "failed") {
        await rollbackConnect(tenant, integrationId, providerName, providerConfigKey, hintConnectionId);
        throw new Error(
          `${providerName} could not be connected: ${failed.errorMessage || "the credentials were rejected"}. Check them and click Connect again.`,
        );
      }
      return NextResponse.json(result);
    }

    if (action === "connectAws") {
      const integrationId = requiredString(body, "integrationId");
      const connection = await createAwsConnection({
        tenantSlug: tenant,
        name: typeof body.name === "string" ? body.name : "AWS",
        authMethod: body.authMethod as any,
        region: requiredString(body, "region"),
        roleArn: typeof body.roleArn === "string" ? body.roleArn : undefined,
        externalId:
          typeof body.externalId === "string" ? body.externalId : undefined,
        crossAccountRoleArn:
          typeof body.crossAccountRoleArn === "string"
            ? body.crossAccountRoleArn
            : undefined,
        accessKeyId:
          typeof body.accessKeyId === "string" ? body.accessKeyId : undefined,
        secretAccessKey:
          typeof body.secretAccessKey === "string"
            ? body.secretAccessKey
            : undefined,
      });
      const tested = await testAwsIntegrationConnection(tenant, connection.id);
      if (!tested.ok) throw new Error(tested.error);
      await updateIntegration({
        tenantSlug: tenant,
        id: integrationId,
        configuration: {
          authMethod: body.authMethod,
          region: body.region,
          awsConnectionId: connection.id,
        },
        isCredentialsAdded: true,
        isEnabled: true,
      });
      return NextResponse.json(await triggerManualScan(tenant, connection.id));
    }

    if (action === "connectAzure") {
      const integrationId = requiredString(body, "integrationId");
      const connection = await createAzureConnection({
        tenantSlugOrId: tenant,
        azureTenantId: requiredString(body, "azureTenantId"),
        subscriptionId: requiredString(body, "subscriptionId"),
        clientId: requiredString(body, "clientId"),
        clientSecret: requiredString(body, "clientSecret"),
      });
      const tested = await testAzureIntegrationConnection(tenant, connection.id);
      if (!tested.ok) throw new Error(tested.error);
      await updateIntegration({
        tenantSlug: tenant,
        id: integrationId,
        configuration: {
          azureConnectionId: connection.id,
          subscriptionId: connection.subscriptionId,
          authentication: "service_principal",
        },
        isCredentialsAdded: true,
        isEnabled: true,
      });
      return NextResponse.json(
        await triggerAzureDiscovery(tenant, connection.id),
      );
    }

    if (action === "connectGoogleCloud") {
      const connection = await createGoogleCloudConnection({
        tenantSlugOrId: tenant,
        projectId: requiredString(body, "projectId"),
        serviceAccountJson: requiredString(body, "serviceAccountJson"),
      });
      const tested = await testGoogleCloudIntegrationConnection(
        tenant,
        connection.id,
      );
      if (!tested.ok) throw new Error(tested.error);
      return NextResponse.json(
        await triggerGoogleCloudDiscovery(tenant, connection.id),
      );
    }

    if (action === "connectDatabricks") {
      const connection = await createDatabricksConnection({
        tenantSlugOrId: tenant,
        workspaceUrl: requiredString(body, "workspaceUrl"),
        accessToken: requiredString(body, "accessToken"),
      });
      const tested = await testDatabricksIntegrationConnection(
        tenant,
        connection.id,
      );
      if (!tested.ok) throw new Error(tested.error);
      return NextResponse.json(
        await triggerDatabricksDiscovery(tenant, connection.id),
      );
    }

    if (action === "connectCrewAI") {
      const connection = await createCrewAIConnection({
        tenantSlugOrId: tenant,
        accessToken: requiredString(body, "accessToken"),
      });
      const tested = await testCrewAIIntegrationConnection(tenant, connection.id);
      if (!tested.ok) throw new Error(tested.error);
      return NextResponse.json(await triggerCrewAIDiscovery(tenant, connection.id));
    }

    if (action === "saveEncryptedCredentials") {
      const integrationId = requiredString(body, "integrationId");
      if (!body.credentials || typeof body.credentials !== "object") {
        throw new Error("credentials are required");
      }
      return NextResponse.json(
        await saveEncryptedIntegrationCredentials({
          tenantSlug: tenant,
          id: integrationId,
          credentials: body.credentials as Record<string, unknown>,
        }),
      );
    }

    if (action === "revoke") {
      await revokeConnection(
        tenant,
        requiredString(body, "integrationId"),
        requiredString(body, "providerName"),
        (body.configuration ?? {}) as Record<string, unknown>,
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "runDiscovery") {
      return NextResponse.json(await runDiscovery(body));
    }

    if (action === "testConnection") {
      const integrationId = requiredString(body, "integrationId");
      const providerName = requiredString(body, "providerName");
      if (providerName === LANGSMITH) {
        return NextResponse.json(
          await testLangSmithIntegrationConnection(tenant, integrationId),
        );
      }
      if (providerName === CREWAI) {
        return NextResponse.json(
          await testCrewAIIntegrationConnection(tenant, integrationId),
        );
      }
      throw new Error(`Test connection is not supported for ${providerName}`);
    }

    if (action === "listLangSmithProjects") {
      const integrationId = requiredString(body, "integrationId");
      return NextResponse.json({
        projects: await listLangSmithIntegrationProjects(tenant, integrationId),
      });
    }

    if (action === "setLangSmithProject") {
      const integrationId = requiredString(body, "integrationId");
      const project = requiredString(body, "project");
      const projectName =
        typeof body.projectName === "string" ? body.projectName : undefined;
      return NextResponse.json(
        await setLangSmithProject(tenant, integrationId, project, projectName),
      );
    }

    if (action === "connectLangSmith") {
      const connection = await createLangSmithConnection({
        tenantSlugOrId: tenant,
        apiKey: requiredString(body, "apiKey"),
        baseUrl:
          typeof body.baseUrl === "string" ? body.baseUrl : undefined,
      });
      const tested = await testLangSmithIntegrationConnection(
        tenant,
        connection.id,
      );
      if (!tested.ok) throw new Error(tested.error);
      return NextResponse.json(await triggerLangSmithSync(tenant, connection.id));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Integration action failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Integration action failed",
      },
      { status: 500 },
    );
  }
}
