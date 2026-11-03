import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { AlertOctagon, Bot, Moon, ShieldAlert, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LiveRefresh } from "@/components/agent-discovery/LiveRefresh";
import { ReportExports } from "@/components/agent-discovery/ReportExports";
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";
import { getExecutiveDashboard, resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";
import { DashboardVisuals } from "./_components/DashboardVisuals";

import { PageTitle } from "@/components/common/PageHeader";
export const dynamic = "force-dynamic";

export default async function ExecutiveRiskDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { userId, orgId } = await auth(); if (!userId || !orgId) throw new Error("Authentication required");
  const { tenant } = await params; const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) throw new Error("Tenant access denied");
  const data = await getExecutiveDashboard(tenantId);
  const cards = [
    ["Total Agents", data.cards.total, Bot, ""], ["Critical Risk Agents", data.cards.critical, AlertOctagon, "text-red-600"],
    ["High Risk Agents", data.cards.high, ShieldAlert, "text-orange-600"], ["Agents Without Owner", data.cards.withoutOwner, UserX, "text-orange-600"],
    ["Dormant Agents", data.cards.dormant, Moon, "text-muted-foreground"],
  ] as const;
  return <main className="space-y-6"><LiveRefresh />
    <header className="flex flex-wrap items-end justify-between gap-3"><div><PageTitle>Executive Risk Dashboard</PageTitle><p className="mt-1 text-sm text-muted-foreground">Live governance posture for every discovered AI agent.</p></div><ReportExports tenant={tenant} snapshot={{ cards: data.cards, autonomy: data.autonomy, ownership: data.ownership, riskLevels: data.riskLevels }} /></header>
    <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-2">{cards.map(([label, value, Icon, tone]) => <CompactMetricCard key={label} label={label} value={value} icon={Icon} tone={tone} uppercaseLabel />)}</div>
    <DashboardVisuals autonomy={data.autonomy} ownership={data.ownership} credentials={data.credentialTypes} platforms={data.platforms} risks={data.riskLevels} trend={data.trend} />
    <section className="rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Recently Discovered Agents</h2><p className="text-xs text-muted-foreground">Latest inventory records with classification and risk-engine output</p></div>{data.recentAgents.length ? <div className="divide-y">{data.recentAgents.map((agent) => { const riskReason = Array.isArray(agent.riskFactors) ? (agent.riskFactors[0] as { description?: string } | undefined)?.description : undefined; const recommendation = agent.agentRecommendations[0]; return <Link key={agent.id} href={`/${tenant}/ai-agent-inventory`} className="block space-y-2 p-4 hover:bg-muted/50"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{agent.name}</span><span className="text-xs text-muted-foreground">{agent.platform}</span><Badge variant="outline">{agent.autonomyLevel ?? "Unclassified"}</Badge><Badge variant="outline">{agent.riskLevel ?? "Unscored"} · {Number(agent.riskScore ?? 0)}</Badge><time className="ml-auto text-xs text-muted-foreground">{new Date(agent.firstSeenAt).toLocaleString()}</time></div><p className="text-xs text-muted-foreground"><strong className="text-foreground">Risk reason:</strong> {riskReason ?? "No active risk factor"}</p><p className="text-xs text-muted-foreground"><strong className="text-foreground">Recommended action:</strong> {recommendation?.suggestedFix ?? "No remediation currently required"}</p></Link>; })}</div> : <p className="p-8 text-center text-sm text-muted-foreground">No agents have been discovered yet.</p>}</section>
    <section className="rounded-xl border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Recent Policy Violations</h2><p className="text-xs text-muted-foreground">Blocked runtime requests from ControlNet during the last 30 days</p></div>{data.recentViolations.length ? <div className="divide-y">{data.recentViolations.map((violation) => <div key={violation.id} className="flex flex-wrap items-center gap-2 p-4 text-sm"><Badge variant="destructive">Blocked</Badge><span className="font-medium">{violation.path || "Runtime request"}</span><span className="text-xs text-muted-foreground">Request {violation.requestId}</span><time className="ml-auto text-xs text-muted-foreground">{new Date(violation.timestamp).toLocaleString()}</time></div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">No blocked policy violations in the last 30 days.</p>}</section>
  </main>;
}
