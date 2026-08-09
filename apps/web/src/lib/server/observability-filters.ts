import { observabilityLogs } from "@db";
import { sql, type SQL } from "drizzle-orm";

import { SUCCESS_STATUS_CODES } from "@/lib/observability-outcome";

/**
 * SQL counterparts of `classifyLogOutcome` so dashboard aggregates agree with
 * the Recent Endpoints table.
 *
 * Counting every non-2xx row as "blocked" reported provider outages, bad model
 * credentials and unresolved policies as guardrail activity. The guardrail
 * result is authoritative; the status code only decides rows where no policy
 * decision was recorded.
 */

const SUCCESS_CODES_SQL = sql.raw(SUCCESS_STATUS_CODES.join(","));

/**
 * The gateway writes the decision under several keys depending on the phase.
 *
 * `coalesce` is load-bearing: `guardrail_results` is NULL whenever the request
 * failed before the guards ran, and an un-coalesced NULL here would make both
 * `isAllowedSql` and `isErrorSql` NULL, dropping those rows from every count.
 */
export const isBlockedSql: SQL = sql`coalesce(
  ${observabilityLogs.guardrailResults} ->> 'blocked' = 'true'
  OR ${observabilityLogs.guardrailResults} -> '_summary' ->> 'was_blocked' = 'true'
  OR ${observabilityLogs.guardrailResults} ->> 'policy_decision' = 'block'
  OR ${observabilityLogs.guardrailResults} -> '_summary' ->> 'decision' = 'block'
, false)`;

/** Guards passed (or never ran) and the request completed successfully. */
export const isAllowedSql: SQL = sql`(
  NOT ${isBlockedSql}
  AND ${observabilityLogs.statusCode} IN (${SUCCESS_CODES_SQL})
)`;

/** Failed without a policy block — provider error, auth failure, bad request. */
export const isErrorSql: SQL = sql`(
  NOT ${isBlockedSql}
  AND ${observabilityLogs.statusCode} NOT IN (${SUCCESS_CODES_SQL})
)`;

/**
 * Model traffic only — the requests guardrails actually run on.
 *
 * `observability_logs` also records the gateway's own control-plane calls
 * (`/v1/policies`, `/v1/observability/*`, `/v1/models`, `/v1/router/*`), which
 * the NORIX UI makes while you use it. Counting those as requests made the
 * dashboard total climb without anyone sending a message, and they can never
 * have a guardrail decision because guards only run on inference.
 */
export const isInferenceTrafficSql: SQL = sql`(
  ${observabilityLogs.path} LIKE '%/chat/completions'
  OR ${observabilityLogs.path} LIKE '%/completions'
  OR ${observabilityLogs.path} LIKE '%/embeddings'
  OR ${observabilityLogs.path} LIKE '%/messages'
  OR ${observabilityLogs.path} LIKE '%/guard/check'
)`;
