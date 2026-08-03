/**
 * Pure helpers for the Observability dashboard: aggregate synced LangSmith runs
 * into metrics, and reconstruct LangGraph execution structure from a run and
 * its child runs. Kept in a plain module (no "use server") so these synchronous
 * functions can be shared by server queries/actions without becoming server
 * actions themselves.
 */

import type { langsmithRuns } from "@/db";

export type LangSmithRunRow = typeof langsmithRuns.$inferSelect;

export interface LangSmithMetrics {
  totalRuns: number;
  successCount: number;
  errorCount: number;
  successRate: number; // 0..1
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  toolCallCount: number;
  /** Runs bucketed by UTC day for the timeline chart, ascending. */
  timeline: { date: string; runs: number; errors: number }[];
}

export function isErrorRun(run: LangSmithRunRow): boolean {
  return Boolean(run.errorMessage) || run.status === "error";
}

/** Aggregate a set of already-loaded runs into dashboard metrics. */
export function computeLangSmithMetrics(
  rows: LangSmithRunRow[],
): LangSmithMetrics {
  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let toolCallCount = 0;
  const timelineMap = new Map<string, { runs: number; errors: number }>();

  for (const run of rows) {
    const errored = isErrorRun(run);
    if (errored) errorCount += 1;
    else successCount += 1;
    if (typeof run.latencyMs === "number") latencies.push(run.latencyMs);
    promptTokens += run.promptTokens ?? 0;
    completionTokens += run.completionTokens ?? 0;
    totalTokens += run.totalTokens ?? 0;
    if (run.totalCost != null) {
      const cost = Number(run.totalCost);
      if (Number.isFinite(cost)) totalCost += cost;
    }
    if (Array.isArray(run.toolCalls)) toolCallCount += run.toolCalls.length;

    const day = run.startTime ? run.startTime.slice(0, 10) : null;
    if (day) {
      const bucket = timelineMap.get(day) ?? { runs: 0, errors: 0 };
      bucket.runs += 1;
      if (errored) bucket.errors += 1;
      timelineMap.set(day, bucket);
    }
  }

  latencies.sort((a, b) => a - b);
  const avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const p95LatencyMs = latencies.length
    ? latencies[
        Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
      ]
    : null;
  const totalRuns = rows.length;

  const timeline = Array.from(timelineMap.entries())
    .map(([date, v]) => ({ date, runs: v.runs, errors: v.errors }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    totalRuns,
    successCount,
    errorCount,
    successRate: totalRuns ? successCount / totalRuns : 0,
    avgLatencyMs,
    p95LatencyMs,
    promptTokens,
    completionTokens,
    totalTokens,
    totalCost,
    toolCallCount,
    timeline,
  };
}

// ---------------------------------------------------------------------------
// LangGraph enrichment — derived from LangSmith trace data at view time.
// ---------------------------------------------------------------------------

export interface LangGraphNodeStep {
  node: string;
  step: number | null;
  runId: string;
  name: string | null;
  status: string | null;
  startTime: string | null;
  latencyMs: number | null;
  inputs: unknown;
  outputs: unknown;
}

export interface DerivedLangGraph {
  graphName: string | null;
  threadId: string | null;
  status: string | null;
  nodes: string[];
  edges: { from: string; to: string }[];
  executionOrder: LangGraphNodeStep[];
  /** Node name -> number of times it executed (>1 implies a retry/loop). */
  retries: Record<string, number>;
}

/** LangGraph metadata LangSmith attaches lives on run.extra.metadata, which the
 *  sync stores under `memory`; `context` holds the raw `extra`. */
function langgraphMeta(run: LangSmithRunRow): Record<string, unknown> {
  const memory = (run.memory as Record<string, unknown>) ?? {};
  const context = (run.context as Record<string, unknown>) ?? {};
  const contextMeta = (context.metadata as Record<string, unknown>) ?? {};
  return { ...contextMeta, ...memory };
}

function nodeName(meta: Record<string, unknown>): string | null {
  const value =
    meta.langgraph_node ?? meta.langgraph_checkpoint_ns ?? meta.checkpoint_ns;
  return typeof value === "string" && value.trim() ? value : null;
}

function stepNumber(meta: Record<string, unknown>): number | null {
  const value = meta.langgraph_step;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasLangGraphSignal(meta: Record<string, unknown>): boolean {
  return Object.keys(meta).some((k) => k.startsWith("langgraph_"));
}

/**
 * Reconstruct a LangGraph execution from a LangSmith run and its child runs.
 * Returns null when no LangGraph signal is present, so callers can hide the
 * graph UI entirely.
 */
export function deriveLangGraph(
  run: LangSmithRunRow,
  childRuns: LangSmithRunRow[],
): DerivedLangGraph | null {
  const candidates = [run, ...childRuns];
  const signal = candidates.some((r) => hasLangGraphSignal(langgraphMeta(r)));
  if (!signal) return null;

  const steps: LangGraphNodeStep[] = [];
  for (const r of candidates) {
    const meta = langgraphMeta(r);
    const node = nodeName(meta);
    if (!node) continue;
    steps.push({
      node,
      step: stepNumber(meta),
      runId: r.id,
      name: r.name ?? null,
      status: isErrorRun(r) ? "error" : (r.status ?? "success"),
      startTime: r.startTime ?? null,
      latencyMs: r.latencyMs ?? null,
      inputs: r.inputs ?? {},
      outputs: r.outputs ?? {},
    });
  }

  steps.sort((a, b) => {
    if (a.step != null && b.step != null && a.step !== b.step) {
      return a.step - b.step;
    }
    const at = a.startTime ? Date.parse(a.startTime) : 0;
    const bt = b.startTime ? Date.parse(b.startTime) : 0;
    return at - bt;
  });

  const nodes: string[] = [];
  const retries: Record<string, number> = {};
  for (const s of steps) {
    if (!nodes.includes(s.node)) nodes.push(s.node);
    retries[s.node] = (retries[s.node] ?? 0) + 1;
  }

  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < steps.length; i += 1) {
    const from = steps[i - 1].node;
    const to = steps[i].node;
    if (from === to) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to });
  }

  const rootMeta = langgraphMeta(run);
  const threadId =
    (typeof rootMeta.thread_id === "string" && rootMeta.thread_id) ||
    (typeof rootMeta.langgraph_thread_id === "string" &&
      rootMeta.langgraph_thread_id) ||
    run.traceId ||
    null;
  const graphName =
    (typeof rootMeta.graph_id === "string" && rootMeta.graph_id) ||
    (typeof rootMeta.langgraph_host === "string" && rootMeta.langgraph_host) ||
    run.name ||
    null;

  return {
    graphName,
    threadId,
    status: isErrorRun(run) ? "error" : (run.status ?? "success"),
    nodes,
    edges,
    executionOrder: steps,
    retries,
  };
}
