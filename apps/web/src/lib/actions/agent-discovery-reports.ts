"use server";

import { auth } from "@clerk/nextjs/server";
import { db, reports } from "@db";
import { revalidatePath } from "next/cache";
import { resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";

export async function recordAgentDiscoveryExport(tenant: string, format: "pdf" | "csv" | "xlsx", snapshot: unknown) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const now = new Date().toISOString();
  await db.insert(reports).values({
    tenantId, name: `Agent Registry Executive Report - ${now.slice(0, 10)}`, reportType: "executive",
    description: "Live AI agent discovery risk and governance report", generatedBy: userId,
    status: "completed", reportData: snapshot, metadata: { module: "ai_agent_discovery", format },
    generatedAt: now, updatedAt: now,
  });
  revalidatePath(`/${tenant}/ai-agent-discovery/journey`);
  return { generatedAt: now };
}
