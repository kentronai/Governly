"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, integrations, tenants } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { runGithubDiscoveryScan } from "@/lib/server/github/discovery-orchestrator";
import { isGithubProviderKey } from "@/lib/integrations/categories";

async function context(slugOrId: string) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  let rows = await db.select().from(tenants).where(eq(tenants.id, slugOrId)).limit(1);
  if (!rows.length) {
    rows = await db.select().from(tenants).where(eq(tenants.slug, slugOrId)).limit(1);
  }
  if (!rows.length || rows[0].id !== orgId) throw new Error("Tenant access denied");
  return { tenantId: orgId, userId };
}

/** Scans the repositories behind a connected GitHub integration for agents. */
export async function triggerGithubDiscovery(tenantSlugOrId: string, id: string) {
  const { tenantId, userId } = await context(tenantSlugOrId);
  const row = await db.query.integrations.findFirst({
    where: and(eq(integrations.id, id), eq(integrations.tenantId, tenantId)),
  });
  if (!row || !isGithubProviderKey(row.nangoProviderConfigKey)) {
    throw new Error("GitHub connection not found");
  }
  const result = await runGithubDiscoveryScan(tenantId, id, row, userId);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "github_discovery.manual_scan",
    targetType: "integration",
    targetId: id,
    metadata: result,
  });
  for (const route of [
    "ai-agent-inventory",
    "ai-agent-discovery/dashboard",
    "admin/integrations",
  ]) {
    revalidatePath(`/${tenantSlugOrId}/${route}`);
  }
  return result;
}
