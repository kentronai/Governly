"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = { count: { label: "Agents" } } satisfies ChartConfig;
const autonomyColors: Record<string, string> = { L1: "#10b981", L2: "#eab308", L3: "#f97316", L4: "#ef4444" };

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border bg-card p-4"><h2 className="font-semibold">{title}</h2><p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>{children}</section>;
}

function EmptyAware({ data, children }: { data: { count: number }[]; children: React.ReactNode }) {
  return data.some((item) => item.count > 0) ? children : <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No discovered agent data yet</div>;
}

export function DashboardVisuals({ autonomy, platforms, trend }: {
  autonomy: { level: string; count: number }[];
  platforms: { label: string; count: number }[];
  trend: { date: string; count: number }[];
}) {
  const bars = (data: { count: number }[], key: "level" | "label", colors?: Record<string, string>) => <EmptyAware data={data}>
    <ChartContainer config={config} className="h-40 w-full"><BarChart data={data}><CartesianGrid vertical={false} />
      <XAxis dataKey={key} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={24} />
      <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" radius={5} maxBarSize={48}>{data.map((item, index) =>
        <Cell key={index} fill={colors?.[String((item as Record<string, unknown>)[key])] ?? "#4f46e5"} />)}</Bar></BarChart></ChartContainer></EmptyAware>;
  return <div className="grid gap-4 lg:grid-cols-3">
    <Card title="Autonomy Levels" subtitle="L1 answers only · L2 uses tools · L3 acts on apps · L4 executes autonomously">{bars(autonomy, "level", autonomyColors)}</Card>
    <Card title="Platform Distribution" subtitle="Where discovered agents run">{bars(platforms, "label")}</Card>
    <Card title="Discovery Trend" subtitle="New agents first observed in the last 30 days">{trend.length ? <ChartContainer config={config} className="h-40 w-full"><LineChart data={trend}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={24} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="count" stroke="#4f46e5" strokeWidth={2} dot /></LineChart></ChartContainer> : <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No discoveries in this period</div>}</Card>
  </div>;
}
