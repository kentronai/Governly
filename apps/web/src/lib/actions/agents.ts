/**
 * Server actions wrapping the read-only agent queries for client-side use
 * on the Agent Inventory page (search/filter/sort/paginate/refresh).
 */

"use server";

import { auth } from "@clerk/nextjs/server";
import { agents, applications, db, tenants } from "@db";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  getAgentApplicationOptions,
  getAgents,
  getAgentDetail,
  getAgentFilterOptions,
  getAgentInventorySummary,
  type AgentListFilters,
} from "@/lib/queries/agents";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";
import { revalidatePath } from "next/cache";

async function resolveTenantId(tenantSlugOrId: string): Promise<string> {
  const [tenantRow] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(or(eq(tenants.id, tenantSlugOrId), eq(tenants.slug, tenantSlugOrId)))
    .limit(1);
  if (!tenantRow) throw new Error("Tenant not found");
  return tenantRow.id;
}

export const fetchAgents = async (
  tenantSlugOrId: string,
  filters: AgentListFilters,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  return getAgents(tenantId, filters);
};

export const fetchAgentDetail = async (
  tenantSlugOrId: string,
  agentId: string,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  await syncAgentPolicyEvaluations(tenantId, agentId);
  return getAgentDetail(tenantId, agentId);
};

export const fetchAgentFilterOptions = async (tenantSlugOrId: string) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  return getAgentFilterOptions(tenantId);
};

export const fetchAgentInventorySummary = async (tenantSlugOrId: string) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  return getAgentInventorySummary(tenantId);
};

export const fetchAgentApplicationOptions = async (tenantSlugOrId: string) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  return getAgentApplicationOptions(tenantId);
};

export const assignAgentToApplication = async (
  tenantSlugOrId: string,
  agentId: string,
  applicationId: string | null,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  if (applicationId) {
    const application = await db.query.applications.findFirst({
      where: and(
        eq(applications.id, applicationId),
        eq(applications.tenantId, tenantId),
        isNull(applications.deletedAt),
      ),
    });
    if (!application) throw new Error("Application not found");
  }
  const [updated] = await db
    .update(agents)
    .set({ applicationId, updatedAt: new Date().toISOString() })
    .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)))
    .returning({ id: agents.id });
  if (!updated) throw new Error("Agent not found");
  await syncAgentPolicyEvaluations(tenantId, agentId);
  revalidatePath(`/${tenantSlugOrId}/ai-agent-inventory`);
  return getAgentDetail(tenantId, agentId);
};
