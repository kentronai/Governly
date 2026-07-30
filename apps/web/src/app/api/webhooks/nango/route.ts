/**
 * Receives Nango's webhooks. On a successful connection creation we persist the
 * `nango_connection_id` + `nango_provider_config_key` onto the tenant's
 * `integrations` row, so discovery can later call the Nango Proxy for that
 * connection. The credential itself stays in the Nango vault — NORIX only keeps
 * the pointer.
 *
 * Signature is verified with HMAC-SHA256 over the raw body using
 * NANGO_WEBHOOK_SECRET (set the same value in the Nango dashboard).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, integrations } from "@db";

export const runtime = "nodejs";

// Maps a Nango provider-config key to the candidate NORIX integration names
// (including legacy names) so a connection lands on the right marketplace row.
const PROVIDER_CONFIG_TO_INTEGRATION_NAMES: Record<string, string[]> = {
  databricks: ["Databricks Unity Catalog", "Databricks"],
  google: ["Google Cloud"],
  "google-cloud": ["Google Cloud"],
  azure: ["Azure"],
  aws: ["AWS"],
  crewai: ["CrewAI"],
};

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.NANGO_WEBHOOK_SECRET;
  // If no secret is configured we cannot verify — refuse rather than trust.
  if (!secret) {
    console.error("NANGO_WEBHOOK_SECRET not set; rejecting Nango webhook");
    return false;
  }
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-nango-signature") ??
    request.headers.get("X-Nango-Signature");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Defensive field access — Nango payload keys have varied across versions.
  const type = payload?.type ?? payload?.webhookType;
  const operation = payload?.operation;
  const success = payload?.success ?? true;
  const connectionId = payload?.connectionId ?? payload?.connection_id;
  const providerConfigKey =
    payload?.providerConfigKey ?? payload?.provider_config_key;
  const tags = payload?.tags ?? payload?.metadata ?? {};
  const endUserId =
    payload?.endUser?.endUserId ??
    payload?.endUser?.id ??
    payload?.end_user?.id ??
    payload?.end_user?.end_user_id ??
    tags?.norix_tenant_id ??
    tags?.norixTenantId ??
    tags?.end_user_id ??
    tags?.tenantId;
  const taggedIntegrationId =
    tags?.norix_integration_id ??
    tags?.norixIntegrationId ??
    tags?.integrationId ??
    payload?.integrationId;

  // Only act on successful auth/connection creation events.
  const isConnectionCreation =
    (type === "auth" || type === undefined) &&
    (operation === undefined || operation === "creation");

  if (!isConnectionCreation || !success || !connectionId || !providerConfigKey) {
    // Acknowledge other event types so Nango doesn't retry.
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!endUserId) {
    console.error("Nango webhook missing endUser id; cannot map to a tenant");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const candidateNames =
    PROVIDER_CONFIG_TO_INTEGRATION_NAMES[String(providerConfigKey)] ?? [];

  if (candidateNames.length === 0) {
    console.error(
      `Nango webhook: unknown providerConfigKey=${providerConfigKey}`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    // end_user.id is the NORIX tenant id (set when creating the session).
    const target =
      typeof taggedIntegrationId === "string" && taggedIntegrationId
        ? await db.query.integrations.findFirst({
            where: and(
              eq(integrations.tenantId, String(endUserId)),
              eq(integrations.id, taggedIntegrationId),
            ),
          })
        : await db.query.integrations.findFirst({
            where: and(
              eq(integrations.tenantId, String(endUserId)),
              inArray(integrations.name, candidateNames),
            ),
          });

    if (!target) {
      console.error(
        `Nango webhook: no integration row for tenant=${endUserId} providerConfigKey=${providerConfigKey}`,
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    await db
      .update(integrations)
      .set({
        nangoConnectionId: String(connectionId),
        nangoProviderConfigKey: String(providerConfigKey),
        isCredentialsAdded: true,
        isEnabled: true,
        syncStatus: "pending",
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(integrations.id, target.id));

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to process Nango webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
