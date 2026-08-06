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
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";
import type { LangSmithMetrics } from "@/lib/queries/langsmith-metrics";

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
      {/* Same compact tiles and grid as the Agent Registry. The former per-tile
          hint line now rides along as the card's tooltip (`description`). */}
      <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-2">
        <CompactMetricCard
          icon={Activity}
          label="Total Runs"
          value={totalRuns.toLocaleString()}
          description="Synced from LangSmith"
        />
        <CompactMetricCard
          icon={Gauge}
          label="Success Rate"
          value={`${Math.round(successRate * 100)}%`}
          description={`${totalRuns - errorCount} of ${totalRuns} succeeded`}
        />
        <CompactMetricCard
          icon={AlertTriangle}
          label="Errors"
          value={errorCount.toLocaleString()}
          tone={errorCount > 0 ? "text-red-600" : undefined}
          description="Runs with an error"
        />
        <CompactMetricCard
          icon={Clock}
          label="Avg Latency"
          value={avgLatencyMs != null ? `${avgLatencyMs} ms` : "—"}
          description={
            p95LatencyMs != null ? `p95 ${p95LatencyMs} ms` : undefined
          }
        />
        <CompactMetricCard
          icon={Cpu}
          label="Total Tokens"
          value={totalTokens.toLocaleString()}
          description="Prompt + completion"
        />
        <CompactMetricCard
          icon={Coins}
          label="Cost"
          value={totalCost > 0 ? `$${totalCost.toFixed(4)}` : "$0"}
          description="Across synced runs"
        />
        <CompactMetricCard
          icon={Wrench}
          label="Tool Calls"
          value={toolCallCount.toLocaleString()}
          description="Recorded in traces"
        />
      </div>

      <Card>
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
