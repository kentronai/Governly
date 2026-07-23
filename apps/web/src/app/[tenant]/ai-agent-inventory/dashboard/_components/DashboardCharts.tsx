"use client";

import { Bar, BarChart, CartesianGrid, XAxis, Pie, PieChart, Cell } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const RISK_COLORS: Record<string, string> = {
  Low: "#10b981",
  Medium: "#f59e0b",
  High: "#f97316",
  Critical: "#ef4444",
};

const AUTONOMY_COLORS: Record<string, string> = {
  L1: "#10b981",
  L2: "#f59e0b",
  L3: "#f97316",
  L4: "#ef4444",
};

const OWNERSHIP_COLORS = ["#4C56D6", "#f97316"];

interface Props {
  autonomy: { level: string; count: number }[];
  ownership: { label: string; count: number }[];
  credentialTypes: { label: string; count: number }[];
  riskLevels: { level: string; count: number }[];
}

const chartConfig = { count: { label: "Agents" } } satisfies ChartConfig;

export function DashboardCharts({ autonomy, ownership, credentialTypes, riskLevels }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Autonomy Distribution" subtitle="L1 Observe -> L4 Fully Autonomous">
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={autonomy}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="level" tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" radius={4}>
              {autonomy.map((entry) => (
                <Cell key={entry.level} fill={AUTONOMY_COLORS[entry.level] ?? "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Risk Level Breakdown" subtitle="Every score is rule-derived, see Agent detail for factors">
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={riskLevels}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="level" tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" radius={4}>
              {riskLevels.map((entry) => (
                <Cell key={entry.level} fill={RISK_COLORS[entry.level] ?? "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Ownership" subtitle="Owned vs. Unowned agents">
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={ownership} dataKey="count" nameKey="label" innerRadius={50} outerRadius={80}>
              {ownership.map((entry, i) => (
                <Cell key={entry.label} fill={OWNERSHIP_COLORS[i % OWNERSHIP_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Credential Types" subtitle="How discovered agents authenticate">
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={credentialTypes} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" radius={4} fill="#4C56D6" />
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      {children}
    </div>
  );
}
