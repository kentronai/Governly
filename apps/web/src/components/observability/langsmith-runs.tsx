"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Boxes } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimestamp } from "@/utils/formatTime";
import { useObservabilityIntegrations } from "@/store/tenantLogs.store";
import RunDetailDialog from "./run-detail-dialog";

// Display-only: "non_compliant" -> "Non compliant". Never use for stored values.
const toLabel = (v?: string | null) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "";
function EmptyState({ href }: { href: string }) {
  return (
    <Card className="shadow-sm border">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Boxes className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">LangSmith is not connected</p>
          <p className="text-sm text-muted-foreground">
            Connect LangSmith to stream traces, runs, prompts, tokens, cost and
            latency into Observability.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={href}>Connect from Admin → Integrations</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function LangSmithRuns() {
  const params = useParams();
  const tenant = typeof params?.tenant === "string" ? params.tenant : "";
  const { data, isLoading } = useObservabilityIntegrations();
  const [selectedRun, setSelectedRun] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data.status.langsmith.connected) {
    return <EmptyState href={`/${tenant}/admin/integrations`} />;
  }

  const runs = data.langsmithRuns;

  return (
    <>
      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="text-lg">LangSmith Runs &amp; Traces</CardTitle>
          <CardDescription>
            Latest execution runs synced from LangSmith
            {data.status.langsmith.projectName
              ? ` (${data.status.langsmith.projectName})`
              : ""}
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No runs synced yet. Use “Sync” on the LangSmith integration.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {run.name ?? run.externalRunId}
                    </TableCell>
                    <TableCell>
                      {run.runType ? toLabel(run.runType) : "—"}
                    </TableCell>
                    <TableCell>{run.model ?? "—"}</TableCell>
                    <TableCell>{run.totalTokens ?? "—"}</TableCell>
                    <TableCell>
                      {run.totalCost != null ? `$${run.totalCost}` : "—"}
                    </TableCell>
                    <TableCell>
                      {run.latencyMs != null ? `${run.latencyMs}ms` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={run.errorMessage ? "destructive" : "secondary"}
                      >
                        {run.errorMessage
                          ? "Error"
                          : toLabel(run.status ?? "ok")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {run.startTime ? formatTimestamp(run.startTime) : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedRun({ id: run.id, name: run.name })
                        }
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RunDetailDialog
        runId={selectedRun?.id ?? null}
        runName={selectedRun?.name}
        onClose={() => setSelectedRun(null)}
      />
    </>
  );
}
