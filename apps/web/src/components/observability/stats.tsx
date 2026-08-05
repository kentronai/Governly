import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  Shield,
  Network,
  ShieldCheck,
  ShieldBan,
  GitPullRequestArrow,
  Package,
  AppWindow,
  Clock,
} from "lucide-react";
import { useTenantStats } from "@/store/tenantLogs.store";
import { CompactMetricCard } from "@/components/agent-discovery/CompactMetricCard";
import Loading from "./loading";

export default function Stats() {
  const { data, isLoading } = useTenantStats();
  if (!data || isLoading) {
    return <Loading />;
  }
  return (
    <>
      {/* Same compact metric tiles and grid as the Agent Registry
          (app/[tenant]/ai-agent-inventory/_components/AgentInventory.tsx). */}
      <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-2">
        <CompactMetricCard
          label="Applications"
          value={data.applications}
          icon={AppWindow}
          description="Applications in organisation"
        />
        <CompactMetricCard
          label="Policies"
          value={data.policies}
          icon={Network}
          description="Active configurations"
        />
        <CompactMetricCard
          label="Guardrails"
          value={data.guardrails}
          icon={Shield}
          description="Applied across endpoints"
        />
        <CompactMetricCard
          label="Models"
          value={data.models}
          icon={Package}
          description="Operational models"
        />
        <CompactMetricCard
          label="Avg Latency (ms)"
          value={data.averageLatency}
          icon={Clock}
          description="Average request time in milliseconds"
        />
        <CompactMetricCard
          label="Request Count"
          value={data.requestCount}
          icon={GitPullRequestArrow}
          description="Requests to server"
        />
        <CompactMetricCard
          label="Allowed"
          value={data.allowCount}
          icon={ShieldCheck}
          description="Requests allowed by guardrails"
        />
        <CompactMetricCard
          label="Blocked"
          value={data.blockCount}
          icon={ShieldBan}
          tone="text-red-600"
          description="Requests blocked by guardrails"
        />
      </div>

      <div className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 hidden">
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" />
              Recent Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.logs.slice(0, 3).map((ele, idx) => {
                const now = new Date();
                const timestamp = new Date(ele.timestamp);
                const diffMs = now.getTime() - timestamp.getTime();
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMinutes = Math.floor(
                  (diffMs % (1000 * 60 * 60)) / (1000 * 60)
                );

                const timeAgo =
                  diffHours > 0
                    ? `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
                    : diffMinutes > 0
                      ? `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`
                      : "Just now";

                return (
                  <li className="flex justify-between" key={idx}>
                    <span className="font-medium text-muted-foreground">
                      {/* @ts-ignore */}
                      {ele.requestPayload.model}
                    </span>
                    <span className="text-muted-foreground">{`Requested ${timeAgo}`}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
