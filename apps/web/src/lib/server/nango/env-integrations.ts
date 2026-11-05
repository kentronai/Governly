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
import { createIntegration, listIntegrationKeys } from "./client";

const envName = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, "_");

function envCredentials(key: string, auth: string) {
  const prefix = envName(key);
  const id = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const secret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  // Comma/space separated, e.g. HUBSPOT_SCOPES="crm.objects.contacts.read,oauth"
  const scopes = process.env[`${prefix}_SCOPES`]?.trim().replace(/[\s,]+/g, ",");
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
          category: tabOf(p.category),
          description: `Connect ${p.name} through Nango.`,
          configuration: { nangoProviderKey: p.key },
          isEnabled: false,
          createdBy: userId,
          updatedBy: userId,
        });
      }
    } catch (error) {
      console.error(`Env integrations: failed to enable ${p.key}:`, error);
    }
  }
}
