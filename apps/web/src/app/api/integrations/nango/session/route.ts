/**
 * Mints a short-lived Nango Connect session token for the browser widget
 * (@nangohq/frontend). The token lets the user authorize a provider account;
 * on success Nango fires the connection webhook (see ../../../webhooks/nango).
 *
 * Clerk-authenticated and tenant-scoped: the Nango end-user is the tenant id,
 * so every connection is attributable to the tenant that created it.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db, tenants, integrations } from "@db";
import { createConnectSession, NangoError } from "@/lib/server/nango/client";

async function resolveTenant(tenantSlugOrId: string) {
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
  return rows[0] ?? null;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: {
    tenant?: string;
    integrationId?: string;
    providerConfigKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const providerConfigKey = body.providerConfigKey?.trim();
  const tenantSlugOrId = body.tenant?.trim();
  if (!providerConfigKey || !tenantSlugOrId) {
    return NextResponse.json(
      { error: "tenant and providerConfigKey are required" },
      { status: 400 },
    );
  }

  const tenant = await resolveTenant(tenantSlugOrId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Optional: validate the integration row belongs to this tenant so we only
  // ever mint sessions for known marketplace entries.
  if (body.integrationId) {
    const integration = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.id, body.integrationId),
        eq(integrations.tenantId, tenant.id),
      ),
    });
    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 },
      );
    }
  }

  try {
    const session = await createConnectSession({
      endUserId: tenant.id,
      endUserDisplayName: tenant.name ?? undefined,
      organizationId: tenant.id,
      organizationDisplayName: tenant.name ?? undefined,
      allowedIntegrations: [providerConfigKey],
      tags: {
        end_user_id: tenant.id,
        organization_id: tenant.id,
        norix_tenant_id: tenant.id,
        norixTenantId: tenant.id,
        ...(body.integrationId
          ? {
              norix_integration_id: body.integrationId,
              norixIntegrationId: body.integrationId,
            }
          : {}),
        providerConfigKey,
      },
    });
    return NextResponse.json({
      token: session.token,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    const status = error instanceof NangoError ? 502 : 500;
    console.error("Failed to create Nango connect session:", error);
    return NextResponse.json(
      { error: "Failed to create Nango connect session" },
      { status },
    );
  }
}
