"use client";

import { useCallback, useEffect, useState } from "react";
import { addHours, formatDistanceToNow } from "date-fns";
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
  sourceErrors?: unknown[];
  modelErrors?: unknown[];
  rejected?: unknown[];
  fatal?: string;
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
    health.fatal,
    health.sourceErrors?.length && `${health.sourceErrors.length} sources unreachable`,
    health.modelErrors?.length && `${health.modelErrors.length} jurisdictions failed analysis (will retry)`,
    health.rejected?.length && `${health.rejected.length} updates rejected (could not be verified against the source)`,
  ].filter(Boolean);
  const gaps = status?.coverage.noSources ?? 0;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="h-4 w-4" />
          AI Radar agent
          {run && (
            <Badge className={cn("capitalize", STATUS_STYLE[run.status])}>{run.status}</Badge>
          )}
        </CardTitle>
        <Button size="sm" onClick={start} disabled={starting || running}>
          {starting || running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run now
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Last run"
            value={run ? formatDistanceToNow(new Date(run.startedAt), { addSuffix: true }) : "Never"}
            sub={run ? `${run.trigger === "cron" ? "Scheduled" : "Manual"} · ${run.model ?? "no model"}` : undefined}
          />
          <Stat
            label="Next scheduled run"
            value={
              run
                ? addHours(new Date(run.startedAt), status!.intervalHours).toLocaleDateString()
                : "On next scheduler tick"
            }
            sub={`Every ${Math.round(status?.intervalHours ?? 72) / 24} days`}
          />
          <Stat
            label="Jurisdictions covered"
            value={String(status?.coverage.enabled ?? 0)}
            sub={gaps ? `${gaps} without a primary source` : undefined}
          />
          <Stat
            label="Last run result"
            value={run ? `${run.updatesApplied} updates applied` : "—"}
            sub={run ? `${run.sourcesChanged} of ${run.sourcesChecked} sources changed` : undefined}
          />
        </div>
        {(issues.length > 0 || gaps > 0) && (
          <div className="flex items-start gap-2 text-sm text-yellow-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Health: {[...issues, gaps && `${gaps} coverage gaps (no primary source URL)`].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
