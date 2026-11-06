import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/agent-discovery/LiveRefresh";
import { ReportExports } from "@/components/agent-discovery/ReportExports";
import { getExecutiveDashboard, resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";
import { DashboardVisuals } from "./_components/DashboardVisuals";
import { KpiCards } from "./_components/KpiCards";

import { PageTitle } from "@/components/common/PageHeader";
export const dynamic = "force-dynamic";

export default async function ExecutiveRiskDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { userId, orgId } = await auth(); if (!userId || !orgId) throw new Error("Authentication required");
  const { tenant } = await params; const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const data = await getExecutiveDashboard(tenantId);
  return <main className="space-y-6"><LiveRefresh />
    <header className="flex flex-wrap items-end justify-between gap-3"><div><PageTitle>Agent Risk Dashboard</PageTitle><p className="mt-1 text-sm text-muted-foreground">Live governance posture for every discovered AI agent.</p></div><ReportExports tenant={tenant} snapshot={{ cards: data.cards, autonomy: data.autonomy, platforms: data.platforms }} /></header>
    <KpiCards tenant={tenant} agents={data.agentList} />
    <DashboardVisuals autonomy={data.autonomy} platforms={data.platforms} trend={data.trend} />
    <section className="min-w-0 rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Recent Policy Violations</h2><p className="text-xs text-muted-foreground">Missing observability and models not approved in the Model Registry, updated every scan</p></div>
      <Table>
        <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Reason</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.agentViolations.map((v) => <TableRow key={`${v.agentId}-${v.reason}`}>
            <TableCell className="font-medium"><Link href={`/${tenant}/ai-agent-inventory`} className="hover:underline">{v.agentName}</Link></TableCell>
            <TableCell><Badge variant="destructive">{v.policy}</Badge></TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground" title={v.reason}>{v.reason}</TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground"><time>{new Date(v.detectedAt).toLocaleString()}</time></TableCell>
          </TableRow>)}
          {data.recentViolations.map((violation) => <TableRow key={violation.id}>
            <TableCell className="font-medium">{violation.path || "Runtime request"}</TableCell>
            <TableCell><Badge variant="destructive">Blocked request</Badge></TableCell>
            <TableCell className="max-w-md truncate text-muted-foreground">Request blocked by a runtime policy.</TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground"><time>{new Date(violation.timestamp).toLocaleString()}</time></TableCell>
          </TableRow>)}
          {data.agentViolations.length + data.recentViolations.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No policy violations.</TableCell></TableRow> : null}
        </TableBody>
      </Table>
    </section>
  </main>;
}
