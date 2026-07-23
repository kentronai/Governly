"use server";
import {
  applicationModels,
  applicationPolicies,
  db,
  guardrails,
  observabilityLogs,
  policyGuardrails,
} from "@/db";
import { and, eq, inArray, notInArray, isNotNull, sql } from "drizzle-orm";

const ALLOWED_CODES = [200, 201];
export interface ControlnetStats {
  models: number;
  policies: number;
  guardrails: number;
  requestCount: number;
  blockCount: number;
  allowCount: number;
  averageLatency: number;

  logs: {
    path: string | null;
    timestamp: string;
    requestPayload: unknown;
  }[];
}

export const getControlnetStats = async ({
  tenantId,
  applicationId,
}: {
  tenantId: string;
  applicationId: string;
}): Promise<ControlnetStats> => {
  // Get all policy IDs linked to this application
  const policyIds = (
    await db.query.applicationPolicies.findMany({
      where: and(
        eq(applicationPolicies.tenantId, tenantId),
        eq(applicationPolicies.applicationId, applicationId)
      ),
      columns: { policyId: true },
    })
  ).map((ele) => ele.policyId);

  const [policyGuardrailList, models, logs, logStats] = await Promise.all([
    policyIds.length
      ? db.query.policyGuardrails
          .findMany({
            where: inArray(policyGuardrails.policyId, policyIds),
            columns: { guardrailId: true },
          })
          .then((rows) => rows.map((ele) => ele.guardrailId))
      : Promise.resolve([] as string[]),
    db.query.applicationModels
      .findMany({
        where: and(
          eq(applicationModels.tenantId, tenantId),
          eq(applicationModels.applicationId, applicationId)
        ),
        columns: { id: true },
      })
      .then((rows) => rows.length),
    // Filter by application_id (auto-resolved by ControlNet from policy)
    db.query.observabilityLogs.findMany({
      columns: {
        path: true,
        timestamp: true,
        requestPayload: true,
      },
      where: and(
        eq(observabilityLogs.tenantId, tenantId),
        eq(observabilityLogs.applicationId, applicationId)
      ),
      orderBy: (logs, { desc }) => [desc(logs.createdAt)],
      limit: 3,
    }),
    db
      .select({
        requestCount: sql<number>`count(*)`,
        allowCount: sql<number>`count(*) filter (where ${observabilityLogs.statusCode} in (200, 201))`,
        averageLatency: sql<number>`coalesce(avg(${observabilityLogs.latencyMs}) filter (where ${observabilityLogs.latencyMs} > 0), 0)`,
      })
      .from(observabilityLogs)
      .where(
        and(
          isNotNull(observabilityLogs.statusCode),
          notInArray(observabilityLogs.statusCode, [500]),
          eq(observabilityLogs.tenantId, tenantId),
          eq(observabilityLogs.applicationId, applicationId)
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
  const blockCount = requestCount - allowCount;
  const averageLatency = Math.round(Number(logStats?.averageLatency ?? 0));

  return {
    models,
    policies: policyIds.length,
    guardrails: guardrailCount,
    requestCount,
    blockCount,
    allowCount,
    averageLatency,
    logs,
  };
};
