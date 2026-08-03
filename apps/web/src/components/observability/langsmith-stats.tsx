"use client";

import {
  Activity,
  AlertTriangle,
  Clock,
  Coins,
  Cpu,
  Gauge,
  Wrench,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LangSmithMetrics } from "@/lib/queries/langsmith-metrics";

function StatTile({
  icon: Icon,
  title,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="shadow-sm border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
        {hint ? (
          <p className="text-sm text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const chartConfig = {
  runs: { label: "Runs", color: "#2563eb" },
  errors: { label: "Errors", color: "#dc2626" },
} satisfies ChartConfig;

const formatDay = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function LangSmithStats({
  metrics,
}: {
  metrics: LangSmithMetrics;
}) {
  const {
    totalRuns,
    successRate,
    errorCount,
    avgLatencyMs,
    p95LatencyMs,
    totalTokens,
    totalCost,
    toolCallCount,
    timeline,
  } = metrics;

  const chartData = timeline.map((point) => ({
    ...point,
    formattedDay: formatDay(point.date),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Activity}
          title="Total Runs"
          value={totalRuns.toLocaleString()}
          hint="Synced from LangSmith"
        />
        <StatTile
          icon={Gauge}
          title="Success Rate"
          value={`${Math.round(successRate * 100)}%`}
          hint={`${totalRuns - errorCount} of ${totalRuns} succeeded`}
        />
        <StatTile
          icon={AlertTriangle}
          title="Errors"
          value={errorCount.toLocaleString()}
          hint="Runs with an error"
        />
        <StatTile
          icon={Clock}
          title="Avg Latency"
          value={avgLatencyMs != null ? `${avgLatencyMs} ms` : "—"}
          hint={p95LatencyMs != null ? `p95 ${p95LatencyMs} ms` : undefined}
        />
        <StatTile
          icon={Cpu}
          title="Total Tokens"
          value={totalTokens.toLocaleString()}
          hint="Prompt + completion"
        />
        <StatTile
          icon={Coins}
          title="Cost"
          value={totalCost > 0 ? `$${totalCost.toFixed(4)}` : "$0"}
          hint="Across synced runs"
        />
        <StatTile
          icon={Wrench}
          title="Tool Calls"
          value={toolCallCount.toLocaleString()}
          hint="Recorded in traces"
        />
      </div>

      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="text-lg">Runs Over Time</CardTitle>
          <CardDescription>
            Daily execution volume and errors from LangSmith.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              No runs synced yet.
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <AreaChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="formattedDay"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="runs"
                  stroke="#2563eb"
                  fill="rgba(37, 99, 235, 0.08)"
                  strokeWidth={2}
                  name="Runs"
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  stroke="#dc2626"
                  fill="rgba(220, 38, 38, 0.08)"
                  strokeWidth={2}
                  name="Errors"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
