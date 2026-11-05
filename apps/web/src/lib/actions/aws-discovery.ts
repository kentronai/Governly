/**
 * Server actions to trigger and inspect AWS Agent Registry scans.
 */

"use server";

import { db, awsDiscoveryConnections, discoveryScans, tenants } from "@db";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAuditEvent } from "@/lib/server/audit";
import { runDiscoveryScan } from "@/lib/server/aws/discovery-orchestrator";

async function resolveTenantId(tenantSlugOrId: string): Promise<string> {
  let tenantRow = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantSlugOrId))
    .limit(1);
  if (!tenantRow.length) {
    tenantRow = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlugOrId))
      .limit(1);
  }
  if (!tenantRow.length) throw new Error("Tenant not found");
  return tenantRow[0].id;
}

export const triggerManualScan = async (
  tenantSlugOrId: string,
  connectionId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const connection = await db.query.awsDiscoveryConnections.findFirst({
    where: and(
      eq(awsDiscoveryConnections.id, connectionId),
      eq(awsDiscoveryConnections.tenantId, tenantId),
    ),
  });
  if (!connection) throw new Error("Connection not found");

  const result = await runDiscoveryScan(
    tenantId,
    connectionId,
    {
      authMethod: connection.authMethod,
      region: connection.region,
      roleArn: connection.roleArn,
      externalId: connection.externalId,
      crossAccountRoleArn: connection.crossAccountRoleArn,
      encryptedAccessKeyId: connection.encryptedAccessKeyId,
      encryptedSecretAccessKey: connection.encryptedSecretAccessKey,
    },
    userId,
  );

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "aws_discovery.manual_scan",
    targetType: "aws_discovery_connection",
    targetId: connectionId,
    metadata: { ...result },
  });

  revalidatePath(`/${tenantSlugOrId}/ai-agent-inventory`);
  revalidatePath(`/${tenantSlugOrId}/ai-agent-discovery/dashboard`);
  revalidatePath(`/${tenantSlugOrId}/ai-agent-discovery/journey`);
  revalidatePath(`/${tenantSlugOrId}/admin/integrations`);
  return result;
};

/**
 * Starts discovery for an existing connection only when it has never been
 * scanned. This makes the initial connection flow self-healing and is safe to
 * call when the Integrations page loads (including from multiple re-renders).
 */
export const ensureInitialDiscoveryScan = async (
  tenantSlugOrId: string,
  connectionId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const connection = await db.query.awsDiscoveryConnections.findFirst({
    where: and(
      eq(awsDiscoveryConnections.id, connectionId),
      eq(awsDiscoveryConnections.tenantId, tenantId),
    ),
  });
  if (!connection) throw new Error("Connection not found");

  const [existingScan] = await db
    .select()
    .from(discoveryScans)
    .where(
      and(
        eq(discoveryScans.connectionId, connectionId),
        eq(discoveryScans.tenantId, tenantId),
      ),
    )
    .orderBy(desc(discoveryScans.createdAt))
    .limit(1);

  if (existingScan) {
    return {
      started: false as const,
      scanId: existingScan.id,
      status: existingScan.status,
      agentsDiscovered: existingScan.agentsDiscovered,
      errorMessage: existingScan.errorMessage ?? undefined,
    };
  }

  const result = await runDiscoveryScan(
    tenantId,
    connectionId,
    {
      authMethod: connection.authMethod,
      region: connection.region,
      roleArn: connection.roleArn,
      externalId: connection.externalId,
      crossAccountRoleArn: connection.crossAccountRoleArn,
      encryptedAccessKeyId: connection.encryptedAccessKeyId,
      encryptedSecretAccessKey: connection.encryptedSecretAccessKey,
    },
    userId,
  );

  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "aws_discovery.initial_scan",
    targetType: "aws_discovery_connection",
    targetId: connectionId,
    metadata: { ...result },
  });

  revalidatePath(`/${tenantSlugOrId}/ai-agent-inventory`);
  revalidatePath(`/${tenantSlugOrId}/ai-agent-discovery/dashboard`);
  revalidatePath(`/${tenantSlugOrId}/ai-agent-discovery/journey`);
  revalidatePath(`/${tenantSlugOrId}/admin/integrations`);
  return { started: true as const, ...result };
};

export const getScanHistory = async (
  tenantSlugOrId: string,
  connectionId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  return db
    .select()
    .from(discoveryScans)
    .where(
      and(
        eq(discoveryScans.connectionId, connectionId),
        eq(discoveryScans.tenantId, tenantId),
      ),
    )
    .orderBy(desc(discoveryScans.createdAt))
    .limit(20);
};

export const getLatestScan = async (
  tenantSlugOrId: string,
  connectionId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const rows = await db
    .select()
    .from(discoveryScans)
    .where(
      and(
        eq(discoveryScans.connectionId, connectionId),
        eq(discoveryScans.tenantId, tenantId),
      ),
    )
    .orderBy(desc(discoveryScans.createdAt))
    .limit(1);
  return rows[0] ?? null;
};
