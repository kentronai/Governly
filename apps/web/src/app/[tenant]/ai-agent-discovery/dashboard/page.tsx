import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/agent-discovery/LiveRefresh";
import { ReportExports } from "@/components/agent-discovery/ReportExports";
import { getExecutiveDashboard, resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";
import { DashboardVisuals } from "./_components/DashboardVisuals";
import { KpiCards } from "./_components/KpiCards";

import { PageTitle } from "@/components/common/PageHeader";
export const dynamic = "force-dynamic";

const AUTONOMY_TONE: Record<string, string> = { L1: "text-emerald-600", L2: "text-yellow-600", L3: "text-orange-600", L4: "text-red-600" };

export default async function ExecutiveRiskDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { userId, orgId } = await auth(); if (!userId || !orgId) throw new Error("Authentication required");
  const { tenant } = await params; const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const data = await getExecutiveDashboard(tenantId);
  return <main className="space-y-6"><LiveRefresh />
    <header className="flex flex-wrap items-end justify-between gap-3"><div><PageTitle>Agent Risk Dashboard</PageTitle><p className="mt-1 text-sm text-muted-foreground">Live governance posture for every discovered AI agent.</p></div><ReportExports tenant={tenant} snapshot={{ cards: data.cards, autonomy: data.autonomy, platforms: data.platforms }} /></header>
    <KpiCards tenant={tenant} agents={data.agentList} />
    <DashboardVisuals autonomy={data.autonomy} platforms={data.platforms} trend={data.trend} />
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Recent Policy Violations</h2><p className="text-xs text-muted-foreground">Missing observability and models not approved in the Model Registry, updated every scan</p></div>
        {data.agentViolations.length || data.recentViolations.length ? <div className="divide-y">
          {data.agentViolations.map((v) => <Link key={`${v.agentId}-${v.reason}`} href={`/${tenant}/ai-agent-inventory`} className="block space-y-1 p-4 hover:bg-muted/50"><div className="flex flex-wrap items-center gap-2"><Badge variant="destructive">{v.policy}</Badge><span className="font-medium">{v.agentName}</span><time className="ml-auto text-xs text-muted-foreground">{new Date(v.detectedAt).toLocaleString()}</time></div><p className="text-xs text-muted-foreground">{v.reason}</p></Link>)}
          {data.recentViolations.map((violation) => <div key={violation.id} className="flex flex-wrap items-center gap-2 p-4 text-sm"><Badge variant="destructive">Blocked request</Badge><span className="font-medium">{violation.path || "Runtime request"}</span><time className="ml-auto text-xs text-muted-foreground">{new Date(violation.timestamp).toLocaleString()}</time></div>)}
        </div> : <p className="p-8 text-center text-sm text-muted-foreground">No policy violations.</p>}
      </section>
      <section className="min-w-0 rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Recently Discovered Agents</h2><p className="text-xs text-muted-foreground">Newest agents with their autonomy level and why</p></div>
        {data.recentAgents.length ? <div className="divide-y">{data.recentAgents.map((agent) => <Link key={agent.id} href={`/${tenant}/ai-agent-inventory`} className="block space-y-1 p-4 hover:bg-muted/50"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{agent.name}</span><Badge variant="outline" className={AUTONOMY_TONE[agent.autonomy.level]}>{agent.autonomy.level}</Badge>{agent.profile.framework ? <Badge variant="outline">{agent.profile.framework}</Badge> : null}<time className="ml-auto text-xs text-muted-foreground">{new Date(agent.firstSeenAt).toLocaleString()}</time></div><p className="text-xs text-muted-foreground">{agent.autonomy.reason}</p></Link>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">No agents have been discovered yet.</p>}
      </section>
    </div>
  </main>;
}
