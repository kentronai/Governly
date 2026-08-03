"use server";

/**
 * Read models for the Observability dashboard. LangSmith is the single runtime
 * observability data source: all reads are tenant-scoped and only return data
 * once LangSmith is connected, so the dashboard renders an empty-state CTA
 * otherwise. LangGraph is no longer a separate integration — when a synced
 * LangSmith run is graph-based, its graph structure is derived on the fly from
 * the run and its child runs (see deriveLangGraph in ./langsmith-metrics).
 */

import { and, desc, eq } from "drizzle-orm";
import { db, integrations, langsmithRuns } from "@/db";
import { cache } from "react";
import {
  computeLangSmithMetrics,
  deriveLangGraph,
  type DerivedLangGraph,
  type LangSmithMetrics,
  type LangSmithRunRow,
} from "./langsmith-metrics";

export interface IntegrationStatus {
  integrationId: string | null;
  connected: boolean;
  projectName: string | null;
  lastSyncAt: string | null;
  health: "healthy" | "degraded" | "failed" | "not_connected";
  errorMessage: string | null;
}

export interface ObservabilityIntegrationStatus {
  langsmith: IntegrationStatus;
}

function toStatus(
  row:
    | {
        id: string;
        configuration: unknown;
        isCredentialsAdded: boolean;
        nangoConnectionId: string | null;
        lastSyncAt: string | null;
        syncStatus: "success" | "failed" | "pending" | null;
        errorMessage: string | null;
      }
    | undefined,
): IntegrationStatus {
  if (!row) {
    return {
      integrationId: null,
      connected: false,
      projectName: null,
      lastSyncAt: null,
      health: "not_connected",
      errorMessage: null,
    };
  }
  const connected = row.isCredentialsAdded || Boolean(row.nangoConnectionId);
  const config = (row.configuration as Record<string, unknown>) ?? {};
  // Prefer the human-friendly label when present (LangSmith stores both the
  // session id under `project` and its name under `projectName`).
  const displayValue = config.projectName ?? config.project;
  const projectName = typeof displayValue === "string" ? displayValue : null;
  const health: IntegrationStatus["health"] = !connected
    ? "not_connected"
    : row.syncStatus === "failed"
      ? "failed"
      : row.errorMessage
        ? "degraded"
        : "healthy";
  return {
    integrationId: row.id,
    connected,
    projectName,
    lastSyncAt: row.lastSyncAt ?? null,
    health,
    errorMessage: row.errorMessage ?? null,
  };
}

async function findIntegration(tenantId: string, name: string) {
  return db.query.integrations.findFirst({
    where: and(
      eq(integrations.tenantId, tenantId),
      eq(integrations.name, name),
    ),
  });
}

export const getObservabilityIntegrationStatus = cache(
  async ({
    tenantId,
  }: {
    tenantId: string;
  }): Promise<ObservabilityIntegrationStatus> => {
    const langsmith = await findIntegration(tenantId, "LangSmith");
    return { langsmith: toStatus(langsmith) };
  },
);

export const getLangSmithRuns = cache(
  async ({
    tenantId,
    projectName,
    limit = 50,
  }: {
    tenantId: string;
    /** When set, only runs whose synced project matches this label. */
    projectName?: string;
    limit?: number;
  }): Promise<LangSmithRunRow[]> => {
    const where = projectName
      ? and(
          eq(langsmithRuns.tenantId, tenantId),
          eq(langsmithRuns.projectName, projectName),
        )
      : eq(langsmithRuns.tenantId, tenantId);
    return db
      .select()
      .from(langsmithRuns)
      .where(where)
      .orderBy(desc(langsmithRuns.startTime))
      .limit(Math.min(Math.max(limit, 1), 200));
  },
);

export const getLangSmithObservabilityMetrics = cache(
  async ({
    tenantId,
    projectName,
  }: {
    tenantId: string;
    projectName?: string;
  }): Promise<LangSmithMetrics> => {
    const where = projectName
      ? and(
          eq(langsmithRuns.tenantId, tenantId),
          eq(langsmithRuns.projectName, projectName),
        )
      : eq(langsmithRuns.tenantId, tenantId);
    const rows = await db.select().from(langsmithRuns).where(where);
    return computeLangSmithMetrics(rows);
  },
);

export interface LangSmithRunDetail {
  run: LangSmithRunRow;
  childRuns: LangSmithRunRow[];
  langgraph: DerivedLangGraph | null;
}

export const getLangSmithRunDetail = cache(
  async ({
    tenantId,
    runId,
  }: {
    tenantId: string;
    runId: string;
  }): Promise<LangSmithRunDetail | null> => {
    const run = await db.query.langsmithRuns.findFirst({
      where: and(
        eq(langsmithRuns.tenantId, tenantId),
        eq(langsmithRuns.id, runId),
      ),
    });
    if (!run) return null;

    const childRuns = run.externalRunId
      ? await db
          .select()
          .from(langsmithRuns)
          .where(
            and(
              eq(langsmithRuns.tenantId, tenantId),
              eq(langsmithRuns.parentRunId, run.externalRunId),
            ),
          )
          .orderBy(desc(langsmithRuns.startTime))
      : [];

    return { run, childRuns, langgraph: deriveLangGraph(run, childRuns) };
  },
);

export interface ObservabilityIntegrationData {
  status: ObservabilityIntegrationStatus;
  metrics: LangSmithMetrics;
  langsmithRuns: LangSmithRunRow[];
}

/** Single round-trip loader for the Observability dashboard client store. */
export async function getObservabilityIntegrationData({
  tenantId,
}: {
  tenantId: string;
}): Promise<ObservabilityIntegrationData> {
  const [status, metrics, runs] = await Promise.all([
    getObservabilityIntegrationStatus({ tenantId }),
    getLangSmithObservabilityMetrics({ tenantId }),
    getLangSmithRuns({ tenantId, limit: 50 }),
  ]);
  return { status, metrics, langsmithRuns: runs };
}
