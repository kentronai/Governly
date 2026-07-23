"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = { count: { label: "Agents" } } satisfies ChartConfig;
const autonomyColors: Record<string, string> = { L1: "#10b981", L2: "#eab308", L3: "#f97316", L4: "#ef4444" };
const riskColors: Record<string, string> = { Low: "#10b981", Medium: "#eab308", High: "#f97316", Critical: "#ef4444" };

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{title}</h2><p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>{children}</section>;
}

function EmptyAware({ data, children }: { data: { count: number }[]; children: React.ReactNode }) {
  return data.some((item) => item.count > 0) ? children : <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No discovered agent data yet</div>;
}

export function DashboardVisuals({ autonomy, ownership, credentials, platforms, risks, trend }: {
  autonomy: { level: string; count: number }[]; ownership: { label: string; count: number }[];
  credentials: { label: string; count: number }[]; platforms: { label: string; count: number }[];
  risks: { level: string; count: number }[]; trend: { date: string; count: number }[];
}) {
  const bars = (data: { count: number }[], key: "level" | "label", colors?: Record<string, string>) => <EmptyAware data={data}>
    <ChartContainer config={config} className="h-56 w-full"><BarChart data={data}><CartesianGrid vertical={false} />
      <XAxis dataKey={key} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={24} />
      <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" radius={5}>{data.map((item, index) =>
        <Cell key={index} fill={colors?.[String((item as Record<string, unknown>)[key])] ?? "#4f46e5"} />)}</Bar></BarChart></ChartContainer></EmptyAware>;
  return <div className="grid gap-4 lg:grid-cols-2">
    <Card title="Agent Distribution by Autonomy" subtitle="Live L1–L4 classifications">{bars(autonomy, "level", autonomyColors)}</Card>
    <Card title="Risk Distribution" subtitle="Current rule-engine risk levels">{bars(risks, "level", riskColors)}</Card>
    <Card title="Ownership Status" subtitle="Agents with and without accountable owners"><EmptyAware data={ownership}><ChartContainer config={config} className="h-56 w-full"><PieChart><ChartTooltip content={<ChartTooltipContent />} /><Pie data={ownership} dataKey="count" nameKey="label" innerRadius={48} outerRadius={78}>{ownership.map((_, i) => <Cell key={i} fill={i === 0 ? "#4f46e5" : "#f97316"} />)}</Pie></PieChart></ChartContainer></EmptyAware></Card>
    <Card title="Credential Types" subtitle="Authentication evidence found during discovery">{bars(credentials, "label")}</Card>
    <Card title="Platform Distribution" subtitle="AWS and other discovered providers">{bars(platforms, "label")}</Card>
    <Card title="Discovery Trend" subtitle="New agents first observed in the last 30 days">{trend.length ? <ChartContainer config={config} className="h-56 w-full"><LineChart data={trend}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={24} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="count" stroke="#4f46e5" strokeWidth={2} dot /></LineChart></ChartContainer> : <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No discoveries in this period</div>}</Card>
  </div>;
}
