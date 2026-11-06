"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Loader2, Play, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/contexts/TenantContext";
import { getRadarStatus, runRadarNow } from "@/lib/actions/ai-radar";
import { cn } from "@/lib/utils";
import { errorToast, infoToast } from "@/lib/utils/toast";

type Status = Awaited<ReturnType<typeof getRadarStatus>>;
type RunHealth = {
  baselined?: number;
  noPrimarySources?: string[];
  discovered?: number;
  sourceErrors?: unknown[];
  modelErrors?: { jurisdiction?: string; error?: string }[];
  fatal?: string;
  rejected?: unknown[];
  searchError?: string;
};

const STATUS_STYLE: Record<string, string> = {
  running: "bg-blue-500/10 text-blue-500",
  completed: "bg-green-500/10 text-green-500",
  failed: "bg-red-500/10 text-red-500",
  interrupted: "bg-yellow-500/10 text-yellow-500",
};

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </div>
);

/** Status + manual trigger for the AI Radar agent (runs automatically every 3 days). */
export function RadarAgentCard({ onRunFinished }: { onRunFinished?: () => void }) {
  const { tenant } = useTenant();
  const [status, setStatus] = useState<Status | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getRadarStatus());
    } catch (e) {
      errorToast(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const running = status?.lastRun?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 5000);
    return () => {
      clearInterval(t);
      onRunFinished?.();
    };
  }, [running, load, onRunFinished]);

  const start = async () => {
    if (!tenant) return;
    setStarting(true);
    try {
      const res = await runRadarNow(tenant.slug);
      if (res.success) {
        infoToast("AI Radar started. Results appear under Updates as they are verified.");
        await load();
      } else {
        errorToast({ message: res.message });
      }
    } catch (e) {
      errorToast(e);
    } finally {
      setStarting(false);
    }
  };

  const run = status?.lastRun;
  const health = (run?.health ?? {}) as RunHealth;
  const issues = [
    health.searchError && "Source search is unavailable",
    health.sourceErrors?.length && `${health.sourceErrors.length} sources unreachable`,
    health.rejected?.length && `${health.rejected.length} updates rejected (could not be verified against the source)`,
  ].filter(Boolean);
  const gaps = status?.coverage.noSources ?? 0;
  const unavailable = status?.enabled === false || run?.status === "failed" || run?.status === "interrupted";
  const unavailableReason =
    status?.enabled === false
      ? "AI Radar is switched off on this server (RADAR_ENABLED=false)."
      : run?.status === "interrupted"
        ? "The last run was interrupted before it finished. Run it again."
        : `The last run failed${health.fatal || health.modelErrors?.[0]?.error ? `: ${health.fatal ?? health.modelErrors?.[0]?.error}` : "."}`;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4" />
          AI Radar agent
          {status?.enabled === false ? (
            <Badge className={STATUS_STYLE.interrupted}>Unavailable</Badge>
          ) : (
            run && <Badge className={cn("capitalize", STATUS_STYLE[run.status])}>{run.status}</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={start} disabled={starting || running}>
            {starting || running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Last run"
            value={run ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }) : "Never"}
            sub={run ? (run.trigger === "cron" ? "Scheduled" : "Manual") : undefined}
          />
          <Stat
            label="New this week"
            value={String(status?.newThisWeek ?? 0)}
            sub={`Checks every ${Math.round(status?.intervalHours ?? 72) / 24} days`}
          />
          <Stat
            label="Jurisdictions monitored"
            value={`${(status?.coverage.enabled ?? 0) - gaps} of ${status?.coverage.enabled ?? 0}`}
            sub={gaps ? `${gaps} waiting for sources` : undefined}
          />
          <Stat
            label="Last run result"
            value={run ? `${run.updatesApplied} found` : "—"}
            sub={
              run
                ? `${run.sourcesChanged} of ${run.sourcesChecked} sources changed${health.discovered ? ` · sources found for ${health.discovered} jurisdictions` : ""}`
                : undefined
            }
          />
        </div>
        {run && !run.model && !unavailable && (
          <p className="text-sm text-muted-foreground">
            No AI model was available for the last run. Add an API key under Admin Center → BYOK to enable AI analysis.
          </p>
        )}
        {unavailable ? (
          <div className="flex items-start gap-2 text-sm text-red-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{unavailableReason}</span>
          </div>
        ) : issues.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-yellow-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {issues.join(" · ")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
