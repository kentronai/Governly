/**
 * Turns providers on from env. An admin adds, e.g.
 *   HUBSPOT_CLIENT_ID=... HUBSPOT_CLIENT_SECRET=...   (OAuth providers)
 *   SLACK_ENABLED=true                                (no client id needed)
 * to .env.integrations and restarts the web container. On the next Integrations
 * page load the provider is registered in Nango and gets a normal Connect card.
 * See .env.integrations.example for every variable.
 */
import { and, eq } from "drizzle-orm";
import { db, integrations } from "@db";
import catalog from "@/lib/integrations/provider-catalog.json";
import { tabOf } from "@/lib/integrations/categories";
import { isGithubProviderKey } from "@/lib/integrations/categories";
import { decryptSecret } from "@/lib/server/crypto";
import { createConnectionWithCredentials, createIntegration, listIntegrationKeys } from "./client";

/**
 * Heal cards broken by older builds: a Revoke that wiped the card's Nango key
 * (it then showed a JSON box), and a GitHub token saved through that box, which
 * sat encrypted on the row where nothing reads it. Move such a token into Nango
 * so discovery and the Model Registry see GitHub as connected.
 */
async function repairCard(row: typeof integrations.$inferSelect, key: string) {
  const config = (row.configuration as Record<string, unknown> | null) ?? {};
  const patch: Partial<typeof integrations.$inferInsert> = {};
  if (config.nangoProviderKey !== key) patch.configuration = { ...config, nangoProviderKey: key };
  if (isGithubProviderKey(key) && row.credentialsEncrypted && !row.nangoConnectionId) {
    try {
      const saved = JSON.parse(decryptSecret(row.credentialsEncrypted)) as Record<string, unknown>;
      const token = Object.values(saved).find((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (token) {
        const connectionId = `${row.tenantId}--${key}`;
        await createConnectionWithCredentials({
          connectionId,
          providerConfigKey: key,
          credentials: { type: "API_KEY", apiKey: token.trim() },
          metadata: { tenantId: row.tenantId, integrationId: row.id },
        });
        Object.assign(patch, {
          nangoConnectionId: connectionId,
          nangoProviderConfigKey: key,
          credentialsEncrypted: null,
          isCredentialsAdded: true,
          isEnabled: true,
          syncStatus: "pending",
          errorMessage: null,
        });
      }
    } catch (error) {
      console.error(`Env integrations: could not move ${row.name}'s saved token into Nango:`, error);
    }
  }
  if (Object.keys(patch).length) {
    await db.update(integrations).set(patch).where(eq(integrations.id, row.id));
  }
}

// GitHub OAuth discovery reads private repos + org repos; without scopes the
// OAuth token only sees public data.
const DEFAULT_SCOPES: Record<string, string> = { github: "repo,read:org" };

const envName = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, "_");

function envCredentials(key: string, auth: string) {
  const prefix = envName(key);
  const id = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const secret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  // Comma/space separated, e.g. HUBSPOT_SCOPES="crm.objects.contacts.read,oauth"
  const scopes =
    process.env[`${prefix}_SCOPES`]?.trim().replace(/[\s,]+/g, ",") || DEFAULT_SCOPES[key];
  if (auth === "OAUTH2" && id && secret) {
    return { enabled: true, credentials: { type: "OAUTH2", client_id: id, client_secret: secret, ...(scopes ? { scopes } : {}) } };
  }
  if (auth === "OAUTH1" && id && secret) {
    return { enabled: true, credentials: { type: "OAUTH1", oauth_client_id: id, oauth_client_secret: secret } };
  }
  // ponytail: ENABLED flag covers every auth mode that needs no integration-level
  // client id; per-connection secrets are then entered in the Connect popup.
  const enabled = process.env[`${prefix}_ENABLED`]?.toLowerCase() === "true";
  return { enabled, credentials: undefined };
}

/** Register env-enabled providers in Nango and add their cards for the tenant. */
export async function ensureEnvIntegrations(tenantId: string, userId: string) {
  const enabled = catalog
    .map((p) => ({ p, ...envCredentials(p.key, (p as { auth?: string }).auth ?? "") }))
    .filter((e) => e.enabled);
  if (!enabled.length) return;

  let registered: Set<string>;
  try {
    registered = await listIntegrationKeys();
  } catch (error) {
    console.error("Env integrations: could not reach Nango:", error);
    return;
  }

  for (const { p, credentials } of enabled) {
    try {
      if (!registered.has(p.key)) {
        await createIntegration({
          provider: p.key,
          uniqueKey: p.key,
          displayName: p.name,
          credentials,
        });
      }
      const existing = await db.query.integrations.findFirst({
        where: and(eq(integrations.tenantId, tenantId), eq(integrations.name, p.name)),
      });
      if (!existing) {
        await db.insert(integrations).values({
          tenantId,
          name: p.name,
          category: tabOf(p.category, p.key),
          description: `Connect ${p.name} through Nango.`,
          configuration: { nangoProviderKey: p.key },
          isEnabled: false,
          createdBy: userId,
          updatedBy: userId,
        });
      } else {
        await repairCard(existing, p.key);
      }
    } catch (error) {
      console.error(`Env integrations: failed to enable ${p.key}:`, error);
    }
  }
}
