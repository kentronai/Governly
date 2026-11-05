"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Activity, CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/utils/formatTime";
import { useObservabilityIntegrations } from "@/store/tenantLogs.store";
import type { IntegrationStatus } from "@/lib/queries/observability-integrations";

const HEALTH_LABEL: Record<IntegrationStatus["health"], string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  failed: "Failed",
  not_connected: "Not connected",
};

function StatusCard({
  title,
  subtitle,
  status,
  href,
}: {
  title: string;
  subtitle: string;
  status: IntegrationStatus;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="shadow-sm border transition-shadow hover:shadow-md">
        <CardContent className="flex items-start justify-between gap-3 p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {status.connected ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="font-semibold">{title}</span>
              <Badge variant={status.connected ? "default" : "secondary"}>
                {status.connected ? "Connected" : "Not Connected"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
            <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">
                  Project / Workspace:{" "}
                </span>
                <span className="font-medium">
                  {status.projectName ?? (status.connected ? "Default" : "—")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Last sync: </span>
                <span className="font-medium">
                  {status.lastSyncAt
                    ? formatTimestamp(status.lastSyncAt)
                    : "Never"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Health: </span>
                <span
                  className={cn(
                    "font-medium",
                    status.health === "healthy" && "text-emerald-600",
                    status.health === "degraded" && "text-amber-600",
                    status.health === "failed" && "text-red-600",
                  )}
                >
                  {HEALTH_LABEL[status.health]}
                </span>
              </div>
            </div>
            {status.errorMessage ? (
              <p className="text-xs text-red-600">{status.errorMessage}</p>
            ) : null}
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function IntegrationStatusSection() {
  const params = useParams();
  const tenant = typeof params?.tenant === "string" ? params.tenant : "";
  const integrationsHref = `/${tenant}/admin/integrations`;
  const { data, isLoading } = useObservabilityIntegrations();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Integration Status</h2>
      </div>
      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <StatusCard
            title="LangSmith"
            subtitle="Execution traces, runs, prompts, tokens, cost & latency"
            status={data.status.langsmith}
            href={integrationsHref}
          />
        </div>
      )}
    </div>
  );
}
