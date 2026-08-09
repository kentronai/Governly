"use server";
import {
  applicationModels,
  applicationPolicies,
  db,
  observabilityLogs,
  policyGuardrails,
  applications,
  guardrails,
} from "@/db";
import {
  and,
  eq,
  inArray,
  sql,
  isNull,
  isNotNull,
  notInArray,
  ne,
} from "drizzle-orm";
import { ControlnetStats } from "../actions/controlnet";
import {
  isAllowedSql,
  isBlockedSql,
  isErrorSql,
  isInferenceTrafficSql,
} from "@/lib/server/observability-filters";
import { cache } from "react";
export interface ObservabilityStats extends ControlnetStats {
  applications: number;
}

export const getObservabilityStats = cache(
  async ({ tenantId }: { tenantId: string }): Promise<ObservabilityStats> => {
    const applicationsList = (
      await db.query.applications.findMany({
        where: and(
          eq(applications.tenantId, tenantId),
          isNull(applications.deletedAt),
          ne(applications.status, "Archived")
        ),
        columns: { id: true },
      })
    ).map((ele) => ele.id);
    const applicationsCount = applicationsList.length;

    const policies = applicationsList.length
      ? (
          await db.query.applicationPolicies.findMany({
            where: inArray(applicationPolicies.applicationId, applicationsList),
            columns: { policyId: true },
          })
        ).map((ele) => ele.policyId)
      : [];

    const [policyGuardrailList, models, logStats] = await Promise.all([
      policies.length
        ? db.query.policyGuardrails
            .findMany({
              where: inArray(policyGuardrails.policyId, policies),
              columns: { guardrailId: true },
            })
            .then((rows) => rows.map((ele) => ele.guardrailId))
        : Promise.resolve([] as string[]),
      db.query.applicationModels
        .findMany({
          where: eq(applicationModels.tenantId, tenantId),
          columns: { id: true },
        })
        .then((rows) => rows.length),
      db
        .select({
          requestCount: sql<number>`count(*)`,
          allowCount: sql<number>`count(*) filter (where ${isAllowedSql})`,
          blockCount: sql<number>`count(*) filter (where ${isBlockedSql})`,
          errorCount: sql<number>`count(*) filter (where ${isErrorSql})`,
          averageLatency: sql<number>`coalesce(avg(${observabilityLogs.latencyMs}) filter (where ${observabilityLogs.latencyMs} > 0), 0)`,
        })
        .from(observabilityLogs)
        .where(
          and(
            eq(observabilityLogs.tenantId, tenantId),
            isNotNull(observabilityLogs.statusCode),
            isInferenceTrafficSql
          )
        )
        .then((rows) => rows[0]),
    ]);

    const guardrailCount = policyGuardrailList.length
      ? Array.from(
          new Set(
            (
              await db.query.guardrails.findMany({
                where: inArray(guardrails.id, policyGuardrailList),
                columns: { fallbackGuardrailId: true },
              })
            ).map((ele) => ele.fallbackGuardrailId)
          )
        ).length
      : 0;

    const requestCount = Number(logStats?.requestCount ?? 0);
    const allowCount = Number(logStats?.allowCount ?? 0);
    const blockCount = Number(logStats?.blockCount ?? 0);
    const errorCount = Number(logStats?.errorCount ?? 0);
    const averageLatency = Math.round(Number(logStats?.averageLatency ?? 0));

    return {
      models,
      policies: policies.length,
      guardrails: guardrailCount,
      applications: applicationsCount,
      requestCount,
      blockCount,
      allowCount,
      errorCount,
      averageLatency,
      logs: [],
    };
  }
);
