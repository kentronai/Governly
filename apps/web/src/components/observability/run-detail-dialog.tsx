"use client";

import { RecordMetadata } from "@/components/common/RecordMetadata";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { ArrowRight, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTimestamp } from "@/utils/formatTime";
import { getLangSmithRunDetail } from "@/lib/queries/observability-integrations";
import type { DerivedLangGraph } from "@/lib/queries/langsmith-metrics";

function Json({ value }: { value: unknown }) {
  const text =
    value == null
      ? "—"
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
  const empty =
    value == null ||
    (typeof value === "object" && Object.keys(value as object).length === 0) ||
    (Array.isArray(value) && value.length === 0);
  return (
    <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words">
      {empty ? "—" : text}
    </pre>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm break-words">{children}</div>
    </div>
  );
}

/** Trace-derived LangGraph execution: flow, nodes/edges, per-step I/O, retries. */
function LangGraphView({ langgraph }: { langgraph: DerivedLangGraph }) {
  const retryNodes = Object.entries(langgraph.retries).filter(
    ([, count]) => count > 1,
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Field label="Graph">{langgraph.graphName ?? "—"}</Field>
        <Field label="Thread ID">
          <span className="font-mono text-xs">{langgraph.threadId ?? "—"}</span>
        </Field>
        <Field label="Status">
          <Badge
            variant={langgraph.status === "error" ? "destructive" : "secondary"}
          >
            {langgraph.status ?? "—"}
          </Badge>
        </Field>
      </div>

      <Field label="Execution Flow">
        {langgraph.executionOrder.length === 0 ? (
          "—"
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {langgraph.executionOrder.map((step, index) => (
              <div key={step.runId} className="flex items-center gap-1.5">
                <Badge
                  variant={step.status === "error" ? "destructive" : "outline"}
                  className="font-mono"
                >
                  {step.step != null ? `${step.step}. ` : ""}
                  {step.node}
                </Badge>
                {index < langgraph.executionOrder.length - 1 ? (
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={`Nodes (${langgraph.nodes.length})`}>
          {langgraph.nodes.length === 0 ? (
            "—"
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {langgraph.nodes.map((node) => (
                <Badge key={node} variant="secondary" className="font-mono">
                  {node}
                </Badge>
              ))}
            </div>
          )}
        </Field>
        <Field label={`Edges (${langgraph.edges.length})`}>
          {langgraph.edges.length === 0 ? (
            "—"
          ) : (
            <ul className="space-y-1">
              {langgraph.edges.map((edge) => (
                <li
                  key={`${edge.from}->${edge.to}`}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span className="font-mono">{edge.from}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{edge.to}</span>
                </li>
              ))}
            </ul>
          )}
        </Field>
      </div>

      {retryNodes.length > 0 ? (
        <Field label="Retries / Loops">
          <div className="flex flex-wrap gap-1.5">
            {retryNodes.map(([node, count]) => (
              <Badge key={node} variant="outline" className="gap-1 font-mono">
                <RotateCcw className="h-3 w-3" />
                {node} ×{count}
              </Badge>
            ))}
          </div>
        </Field>
      ) : null}

      <Separator />

      <Field label="Node Steps (inputs / outputs / timing)">
        <ul className="space-y-2">
          {langgraph.executionOrder.map((step) => (
            <li key={step.runId} className="rounded-md border p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs font-medium">
                  {step.step != null ? `${step.step}. ` : ""}
                  {step.node}
                  {step.name && step.name !== step.node
                    ? ` · ${step.name}`
                    : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {step.latencyMs != null ? `${step.latencyMs} ms` : ""}
                  {step.startTime
                    ? ` · ${formatTimestamp(step.startTime)}`
                    : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    Inputs
                  </div>
                  <Json value={step.inputs} />
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    Outputs
                  </div>
                  <Json value={step.outputs} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Field>
    </div>
  );
}

export default function RunDetailDialog({
  runId,
  runName,
  onClose,
}: {
  runId: string | null;
  runName?: string | null;
  onClose: () => void;
}) {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["langsmith-run-detail", orgId, runId],
    queryFn: async () => {
      if (!orgId || !runId) return null;
      return await getLangSmithRunDetail({ tenantId: orgId, runId });
    },
    enabled: !!orgId && !!runId,
  });

  const run = data?.run;
  const langgraph = data?.langgraph ?? null;

  return (
    <Dialog
      open={Boolean(runId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="truncate">
            {runName || run?.name || "Run details"}
          </DialogTitle>
          <DialogDescription>
            {run?.runType ? `${run.runType} run` : "LangSmith run"}
            {run?.model ? ` • ${run.model}` : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
            </div>
          ) : !run ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Run not found.
            </div>
          ) : (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {/* LangSmith data always exists for a LangSmith run. */}
                <TabsTrigger value="langsmith">LangSmith</TabsTrigger>
                {/* Hidden unless a linked LangGraph execution exists. */}
                {langgraph ? (
                  <TabsTrigger value="langgraph">LangGraph</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Field label="Status">
                    <Badge
                      variant={run.errorMessage ? "destructive" : "secondary"}
                    >
                      {run.status ?? "unknown"}
                    </Badge>
                  </Field>
                  <Field label="Latency">
                    {run.latencyMs != null ? `${run.latencyMs} ms` : "—"}
                  </Field>
                  <Field label="Total tokens">{run.totalTokens ?? "—"}</Field>
                  <Field label="Cost">
                    {run.totalCost != null ? `$${run.totalCost}` : "—"}
                  </Field>
                  <Field label="Prompt tokens">{run.promptTokens ?? "—"}</Field>
                  <Field label="Completion tokens">
                    {run.completionTokens ?? "—"}
                  </Field>
                  <Field label="Project">{run.projectName ?? "—"}</Field>
                  <Field label="Model">{run.model ?? "—"}</Field>
                </div>
                {run.errorMessage ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {run.errorMessage}
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="langsmith" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Trace ID">
                    <span className="font-mono text-xs">
                      {run.traceId ?? "—"}
                    </span>
                  </Field>
                  <Field label="Parent Run">
                    <span className="font-mono text-xs">
                      {run.parentRunId ?? "None (root)"}
                    </span>
                  </Field>
                </div>
                <Separator />
                <Field label="Child Runs">
                  {data && data.childRuns.length > 0 ? (
                    <ul className="space-y-1">
                      {data.childRuns.map((child) => (
                        <li
                          key={child.id}
                          className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                        >
                          <span className="truncate">
                            {child.name ?? child.externalRunId}
                          </span>
                          <Badge variant="outline">
                            {child.runType ?? "run"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "None"
                  )}
                </Field>
                <Field label="System Prompt">
                  <Json value={run.systemPrompt} />
                </Field>
                <Field label="Prompt Details (inputs)">
                  <Json value={run.inputs} />
                </Field>
                <Field label="Outputs / Response">
                  <Json value={run.outputs} />
                </Field>
                <Field label="Tool Calls">
                  <Json value={run.toolCalls} />
                </Field>
                <Field label="Memory">
                  <Json value={run.memory} />
                </Field>
                <Field label="Context">
                  <Json value={run.context} />
                </Field>
                <Field label="Metadata">
                  <Json value={run.metadata} />
                </Field>
                {run.langsmithUrl ? (
                  <a
                    href={run.langsmithUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open in LangSmith <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </TabsContent>

              {langgraph ? (
                <TabsContent value="langgraph" className="space-y-4 pt-4">
                  <LangGraphView langgraph={langgraph} />
                </TabsContent>
              ) : null}
            </Tabs>
          )}
        </ScrollArea>

        {run ? (
          <RecordMetadata className="mx-6 mt-4" createdBy="LangSmith sync" createdAt={run.createdAt} updatedAt={run.updatedAt} />
        ) : null}

        <DialogFooter className="p-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
