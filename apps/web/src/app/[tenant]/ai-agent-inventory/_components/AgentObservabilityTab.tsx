"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, Eye } from "lucide-react";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import Pagination from "@/components/common/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimestamp } from "@/utils/formatTime";
import { successToast, errorToast } from "@/lib/utils/toast";
import {
  getAgentObservability,
  setAgentLangSmithProject,
} from "@/lib/actions/agents";
import { listTenantLangSmithProjects } from "@/lib/actions/langsmith-integration";
import LangSmithStats from "@/components/observability/langsmith-stats";
import RunDetailDialog from "@/components/observability/run-detail-dialog";


// Display-only: "non_compliant" -> "Non compliant". Never use for stored values.
const toLabel = (v?: string | null) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "";
export default function AgentObservabilityTab({
  tenant,
  agentId,
  deployed = true,
}: {
  tenant: string;
  agentId: string;
  /** False when the agent is stopped/undeployed: there is nothing to trace. */
  deployed?: boolean;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRun, setSelectedRun] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  const observabilityKey = ["agent-observability", tenant, agentId];
  const { data, isLoading } = useQuery({
    queryKey: observabilityKey,
    queryFn: () => getAgentObservability(tenant, agentId),
    enabled: Boolean(tenant && agentId),
  });

  const { data: projects } = useQuery({
    queryKey: ["tenant-langsmith-projects", tenant],
    queryFn: () => listTenantLangSmithProjects(tenant),
    enabled: Boolean(tenant) && Boolean(data?.connected),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data.connected) {
    return (
      <Card className="shadow-sm border">
        <CardContent className="flex flex-col items-start gap-2 py-4 text-sm">
          <p className="font-medium">Execution traces (LangSmith) — not connected</p>
          <p className="text-muted-foreground">
            {deployed
              ? "Optional. Connect LangSmith to see this agent's runs here; the detected observability above does not depend on it."
              : "This agent is not running, so there are no runs to trace. Connecting LangSmith will not change that."}
          </p>
          {deployed ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/${tenant}/admin/integrations`}>Connect LangSmith</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const handleProjectChange = async (value: string) => {
    const project = value === "__unmapped__" ? null : value;
    const projectName =
      projects?.find((p) => p.id === project)?.name ?? project ?? undefined;
    setSaving(true);
    try {
      await setAgentLangSmithProject(tenant, agentId, project, projectName);
      await queryClient.invalidateQueries({ queryKey: observabilityKey });
      successToast("", "", "", "Agent observability project updated");
    } catch (error) {
      errorToast(error instanceof Error ? error : "Failed to update project");
    } finally {
      setSaving(false);
    }
  };

  const runs = data.runs;

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="text-lg">LangSmith Project</CardTitle>
          <CardDescription>
            Map this agent to a LangSmith tracing project to show only its runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Select
            value={data.project ?? "__unmapped__"}
            disabled={saving}
            onValueChange={handleProjectChange}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select a LangSmith project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unmapped__">Not mapped</SelectItem>
              {(projects ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </CardContent>
      </Card>

      {!data.project ? (
        <Card className="shadow-sm border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a LangSmith project above to see this agent&apos;s runs,
            latency, tokens, cost and errors.
          </CardContent>
        </Card>
      ) : (
        <>
          <LangSmithStats metrics={data.metrics} />

          <Card className="shadow-sm border">
            <CardHeader>
              <CardTitle className="text-lg">Recent Runs</CardTitle>
              <CardDescription>
                Latest runs for {data.projectName ?? "this project"}.
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
                        No runs synced yet for this project.
                      </TableCell>
                    </TableRow>
                  ) : (
                    runs.slice((page - 1) * pageSize, page * pageSize).map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="max-w-[220px] truncate font-medium">
                          {run.name ?? run.externalRunId}
                        </TableCell>
                        <TableCell>
                          {run.runType ? toLabel(run.runType) : "—"}
                        </TableCell>
                        <TableCell>
                          {run.model ?? "—"}
                        </TableCell>
                        <TableCell>
                          {run.totalTokens ?? "—"}
                        </TableCell>
                        <TableCell>
                          {run.totalCost != null ? `$${run.totalCost}` : "—"}
                        </TableCell>
                        <TableCell>
                          {run.latencyMs != null ? `${run.latencyMs}ms` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              run.errorMessage ? "destructive" : "secondary"
                            }
                          >
                            {run.errorMessage ? "Error" : toLabel(run.status ?? "ok")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {run.startTime ? formatTimestamp(run.startTime) : "—"}
                        </TableCell>
                        <TableCell>
<RowActionsMenu
                            items={[{ label: "View", icon: Eye, onSelect: () => setSelectedRun({ id: run.id, name: run.name }) }]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
                      {runs.length > pageSize && (
                        <Pagination page={page} setPage={setPage} totalPages={Math.ceil(runs.length / pageSize)} pageSize={pageSize} setPageSize={setPageSize} />
                      )}
            </CardContent>
          </Card>

          <RunDetailDialog
            runId={selectedRun?.id ?? null}
            runName={selectedRun?.name}
            onClose={() => setSelectedRun(null)}
          />
        </>
      )}
    </div>
  );
}
