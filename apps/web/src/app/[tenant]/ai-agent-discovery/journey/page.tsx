import { auth } from "@clerk/nextjs/server";
import { CheckCircle2, CircleDashed, Cloud, FileBarChart, Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/agent-discovery/LiveRefresh";
import { ReportExports } from "@/components/agent-discovery/ReportExports";
import { getDiscoveryJourney, getExecutiveDashboard, resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";

import { PageTitle } from "@/components/common/PageHeader";
export const dynamic = "force-dynamic";

function Value({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className="text-right text-sm font-medium">{value}</span></div>;
}
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString() : "Not available"; }
function formatDuration(ms: number | null) { if (ms == null) return "Not available"; return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} sec`; }

export default async function DiscoveryJourneyPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { userId, orgId } = await auth(); if (!userId || !orgId) throw new Error("Authentication required");
  const { tenant } = await params; const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const [journey, dashboard] = await Promise.all([getDiscoveryJourney(tenantId), getExecutiveDashboard(tenantId)]);
  const steps = [
    { title: "Connect", icon: Cloud, complete: journey.connect.connected, rows: <><Value label="Connection status" value={journey.connect.connected ? "Connected" : "Not connected"} /><Value label="Connected sources" value={journey.connect.connectedAccounts} /><Value label="Last successful sync" value={formatDate(journey.connect.lastAuthentication)} /></> },
    { title: "Discover", icon: Search, complete: journey.discover.status === "completed", rows: <><Value label="Last discovery scan" value={formatDate(journey.discover.lastScan)} /><Value label="Agents in registry" value={journey.discover.agentsDiscovered} /><Value label="Resources scanned" value={journey.discover.resourcesScanned} /><Value label="Scan duration (all sources)" value={formatDuration(journey.discover.durationMs)} />{journey.discover.error && <Value label="Scan note" value={journey.discover.error} />}</> },
    { title: "Classify", icon: ShieldCheck, complete: journey.classify.completed, rows: <>{journey.classify.levels.map((item) => <Value key={item.level} label={`${item.level} agents`} value={item.count} />)}<Value label="Classified" value={`${journey.classify.classified} agents`} /></> },
    { title: "Report", icon: FileBarChart, complete: journey.report.generated, rows: <><Value label="Executive report generated" value={journey.report.generated ? "Yes" : "Not yet"} /><Value label="Available formats" value={journey.report.formats.join(" · ")} /><Value label="Last export" value={formatDate(journey.report.lastExport)} /><Value label="Last format" value={journey.report.lastFormat?.toUpperCase() ?? "None"} /></> },
  ];
  return <main className="space-y-6"><LiveRefresh />
    <header className="flex flex-wrap items-end justify-between gap-3"><div><PageTitle>Registry Journey</PageTitle><p className="mt-1 text-sm text-muted-foreground">Current end-to-end state from connected sources through executive reporting.</p></div><ReportExports tenant={tenant} snapshot={{ cards: dashboard.cards, autonomy: dashboard.autonomy, platforms: dashboard.platforms }} /></header>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{steps.map((step, index) => <section key={step.title} className="relative min-w-0 rounded-xl border bg-card p-4"><div className="mb-4 flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><step.icon className="h-5 w-5" /></span>{step.complete ? <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Badge> : <Badge variant="outline"><CircleDashed className="mr-1 h-3 w-3" />Pending</Badge>}</div><p className="text-xs font-medium text-muted-foreground">Step {index + 1}</p><h2 className="mb-3 text-lg font-semibold">{step.title}</h2><div>{step.rows}</div></section>)}</div>
    {journey.connect.connections.length > 0 && <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Connected Sources</h2><div className="mt-3 divide-y">{journey.connect.connections.map((connection) => <div key={connection.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-medium">{connection.name}<span className="ml-2 text-sm font-normal text-muted-foreground">last sync {formatDate(connection.lastSyncAt)}</span></span><Badge variant={connection.healthy ? "default" : "destructive"} title={connection.error ?? undefined}>{connection.healthy ? "Healthy" : "Attention required"}</Badge></div>)}</div></section>}
  </main>;
}
