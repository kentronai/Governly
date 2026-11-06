import { auth } from "@clerk/nextjs/server";
import { LiveRefresh } from "@/components/agent-discovery/LiveRefresh";
import { ReportExports } from "@/components/agent-discovery/ReportExports";
import { getExecutiveDashboard, resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";
import { DashboardVisuals } from "./_components/DashboardVisuals";
import { KpiCards } from "./_components/KpiCards";
import { ViolationsTable, type ViolationRow } from "./_components/ViolationsTable";

import { PageTitle } from "@/components/common/PageHeader";
export const dynamic = "force-dynamic";

export default async function ExecutiveRiskDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { userId, orgId } = await auth(); if (!userId || !orgId) throw new Error("Authentication required");
  const { tenant } = await params; const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const data = await getExecutiveDashboard(tenantId);
  // Short, whole-sentence descriptions: the long observability explanation lives in the agent's detail view.
  const rows: ViolationRow[] = [
    ...data.agentViolations.map((v) => ({
      key: `${v.agentId}-${v.policy}-${v.reason}`,
      agent: v.agentName,
      reason: v.policy,
      description: v.policy === "Observability required" ? "No observability tool detected for this agent." : v.reason,
      detectedAt: new Date(v.detectedAt).toISOString(),
      href: `/${tenant}/ai-agent-inventory`,
    })),
    ...data.recentViolations.map((v) => ({
      key: `req-${v.id}`,
      agent: v.path || "Runtime request",
      reason: "Blocked request",
      description: "Request blocked by a runtime policy.",
      detectedAt: new Date(v.timestamp).toISOString(),
      href: null,
    })),
  ];
  return <main className="space-y-6"><LiveRefresh />
    <header className="flex flex-wrap items-end justify-between gap-3"><div><PageTitle>Agent Risk Dashboard</PageTitle><p className="mt-1 text-sm text-muted-foreground">Live governance posture for every discovered AI agent.</p></div><ReportExports tenant={tenant} snapshot={{ cards: data.cards, autonomy: data.autonomy, platforms: data.platforms }} /></header>
    <KpiCards tenant={tenant} agents={data.agentList} />
    <DashboardVisuals autonomy={data.autonomy} platforms={data.platforms} trend={data.trend} />
    <section className="min-w-0 rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Recent Policy Violations</h2><p className="text-xs text-muted-foreground">Missing observability and models not approved in the Model Registry, updated every scan</p></div>
      <ViolationsTable rows={rows} />
    </section>
  </main>;
}
