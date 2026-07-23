"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db, integrations, tenants } from "@db";

export async function ensureUniversalAgentIntegrationCatalogEntry(
  tenantSlugOrId: string,
) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantSlugOrId),
  });
  if (!tenant) {
    tenant = await db.query.tenants.findFirst({
      where: eq(tenants.slug, tenantSlugOrId),
    });
  }
  if (!tenant || tenant.id !== orgId) throw new Error("Tenant access denied");
  const existing = await db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenant.id),
      eq(integrations.name, "Universal Agent Collector"),
    ),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(integrations)
    .values({
      tenantId: tenant.id,
      name: "Universal Agent Collector",
      category: "cloud_providers",
      description:
        "Registers agents from Kubernetes, on-premises, OCI, DigitalOcean, or any other runtime through NORIX's authenticated ingestion API.",
      configuration: {
        endpoint: "/api/agent-discovery/ingest",
        authentication: "x-api-key",
      },
      metadata: {},
      isEnabled: true,
      isCredentialsAdded: true,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  return created;
}
