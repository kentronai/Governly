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
import {
  getLangSmithObservabilityMetrics,
  getLangSmithRuns,
  getObservabilityIntegrationStatus,
} from "@/lib/queries/observability-integrations";
import {
  computeLangSmithMetrics,
  type LangSmithMetrics,
  type LangSmithRunRow,
} from "@/lib/queries/langsmith-metrics";
import { revalidatePath } from "next/cache";
import { pruneOrphanAgents } from "@/lib/server/agents/prune-orphans";

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
  await pruneOrphanAgents(tenantId);
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
  await pruneOrphanAgents(tenantId);
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

/**
 * Map an agent to a LangSmith tracing project so its Observability tab shows
 * only that agent's runs. `project` is the LangSmith session/project id used to
 * filter runs; `projectName` is the human label shown in the UI and matched
 * against `langsmith_runs.project_name`. Pass a null project to unlink.
 */
export const setAgentLangSmithProject = async (
  tenantSlugOrId: string,
  agentId: string,
  project: string | null,
  projectName?: string | null,
) => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const trimmedProject = project?.trim() || null;
  const [updated] = await db
    .update(agents)
    .set({
      langsmithProject: trimmedProject,
      langsmithProjectName: trimmedProject
        ? (projectName ?? project)?.trim() || null
        : null,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)))
    .returning({ id: agents.id });
  if (!updated) throw new Error("Agent not found");
  revalidatePath(`/${tenantSlugOrId}/ai-agent-inventory`);
  return { ok: true };
};

export interface AgentObservability {
  /** Whether LangSmith is connected for the tenant. */
  connected: boolean;
  /** The LangSmith project id/name this agent is mapped to (if any). */
  project: string | null;
  projectName: string | null;
  metrics: LangSmithMetrics;
  runs: LangSmithRunRow[];
}

/** Runs + metrics for an agent, filtered to its mapped LangSmith project. */
export const getAgentObservability = async (
  tenantSlugOrId: string,
  agentId: string,
): Promise<AgentObservability> => {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  const tenantId = await resolveTenantId(tenantSlugOrId);
  if (tenantId !== orgId) throw new Error("Tenant access denied");

  const status = await getObservabilityIntegrationStatus({ tenantId });
  const [agent] = await db
    .select({
      project: agents.langsmithProject,
      projectName: agents.langsmithProjectName,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.tenantId, tenantId)))
    .limit(1);
  if (!agent) throw new Error("Agent not found");

  const projectName = agent.projectName ?? undefined;
  const canQuery = Boolean(agent.project) && Boolean(projectName);
  const [metrics, runs] = await Promise.all([
    canQuery
      ? getLangSmithObservabilityMetrics({ tenantId, projectName })
      : Promise.resolve(computeLangSmithMetrics([])),
    canQuery
      ? getLangSmithRuns({ tenantId, projectName, limit: 50 })
      : Promise.resolve([] as LangSmithRunRow[]),
  ]);

  return {
    connected: status.langsmith.connected,
    project: agent.project ?? null,
    projectName: agent.projectName ?? null,
    metrics,
    runs,
  };
};
