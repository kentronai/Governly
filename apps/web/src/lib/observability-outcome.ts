/**
 * How an observability log row is classified in the UI and in dashboard counters.
 *
 * A non-2xx status code is NOT the same thing as a guardrail block. ControlNet
 * returns 4xx for plenty of reasons that have nothing to do with policy: the
 * upstream model provider rejecting the request (bad key, unavailable model,
 * quota), an unresolvable policy, a malformed body. Classifying every non-2xx
 * as "Blocked" made the Recent Endpoints table contradict itself — rows showed
 * Status "Blocked" next to Decision "allow" — and inflated the blocked totals
 * on the overview with failures the guardrails never made a decision about.
 *
 * The guardrail result is authoritative: it is written by the gateway from the
 * actual policy decision. The status code only breaks the tie when no guardrail
 * decision was recorded.
 */

export type LogOutcome = "allowed" | "blocked" | "error";

/** Status codes ControlNet returns when a request completed successfully. */
export const SUCCESS_STATUS_CODES = [200, 201];

interface GuardrailDecisionShape {
  policy_decision?: string;
  blocked?: boolean;
  _summary?: { decision?: string; was_blocked?: boolean };
}

/**
 * The policy decision the gateway recorded, or null when the guardrails never
 * reached a decision (auth failure, provider error before/after the guards).
 */
export function getPolicyDecision(
  guardrailResults: unknown,
): "allow" | "block" | null {
  const results = guardrailResults as GuardrailDecisionShape | null | undefined;
  if (!results || typeof results !== "object") return null;

  if (
    results.blocked === true ||
    results._summary?.was_blocked === true ||
    results.policy_decision === "block" ||
    results._summary?.decision === "block"
  ) {
    return "block";
  }

  const decision = results.policy_decision ?? results._summary?.decision;
  if (decision === "allow") return "allow";

  // An explicit non-allow/block decision ("error", "unknown") means the
  // guardrails never ruled on this request — don't read it as an approval.
  if (typeof decision === "string") return null;

  if (results.blocked === false || results._summary?.was_blocked === false) {
    return "allow";
  }

  return null;
}

/**
 * Classify a log row as an allowed request, a policy block, or a failure that
 * never got a policy decision.
 */
export function classifyLogOutcome(log: {
  statusCode?: number | null;
  guardrailResults?: unknown;
}): LogOutcome {
  const decision = getPolicyDecision(log.guardrailResults);
  if (decision === "block") return "blocked";

  const succeeded =
    log.statusCode != null && SUCCESS_STATUS_CODES.includes(log.statusCode);
  if (succeeded) return "allowed";

  // Guards passed (or never ran) and the request still failed — that is an
  // error to surface, not a policy block.
  return "error";
}

/** Human label for the Status column. */
export function getOutcomeLabel(outcome: LogOutcome): string {
  return outcome === "allowed"
    ? "Allowed"
    : outcome === "blocked"
      ? "Blocked"
      : "Error";
}

/**
 * Where the request was actually sent, when that is worth showing.
 *
 * The tenant's Model Registry selection overrides the model named in the
 * request, so a call asking for `gpt-4o-mini` can leave for another provider
 * entirely. When it does, the caller's BYOK key is offered to a provider it
 * does not belong to and the only symptom is an opaque rejection.
 */
export function describeRouting(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, any>;

  const routedModel = record.routed_model;
  const routedProvider = record.routed_provider;
  if (typeof routedModel !== "string" && typeof routedProvider !== "string") {
    return null;
  }

  const target = [routedProvider, routedModel].filter(Boolean).join(" / ");
  const requested = record.model;

  if (typeof requested === "string" && requested && requested !== routedModel) {
    return `${target} — overrides requested "${requested}" (Model Registry selection)`;
  }
  return target || null;
}

/**
 * Best-effort explanation of why a request failed, for rows classified as
 * "error". ControlNet stores the provider/gateway error under a few different
 * shapes depending on which layer raised it.
 */
export function getErrorMessage(log: {
  statusCode?: number | null;
  responsePayload?: unknown;
  metadata?: unknown;
}): string | null {
  const fromPayload = (payload: unknown): string | null => {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, any>;
    const error = record.error ?? record.detail ?? record;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      // The provider's own words are the diagnostic one; the gateway's message
      // is a deliberately generic, caller-safe summary.
      const message =
        error.provider_message ??
        error.message ??
        error.error_message ??
        error.detail;
      if (typeof message === "string") return message;
    }
    return null;
  };

  return (
    fromPayload(log.responsePayload) ??
    fromPayload(log.metadata) ??
    (log.statusCode != null
      ? `Request failed with HTTP ${log.statusCode}`
      : null)
  );
}

/**
 * The assistant's reply, when one was produced.
 *
 * Streaming responses are logged as a completion marker rather than the
 * assembled text, so say that plainly instead of rendering `[object Object]`.
 */
export function getResponseText(log: {
  responsePayload?: unknown;
}): string | null {
  const payload = log.responsePayload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, any>;

  // A policy check has no model output by design — NORIX returned a verdict and
  // the caller's own LLM produced the answer.
  if (typeof record.allowed === "boolean") {
    return record.allowed
      ? "Policy check passed — the answer was generated by your own model, which NORIX does not see."
      : "Policy check blocked this message — it never reached your model.";
  }

  if (record.stream === true) {
    return "Streamed to the caller (response body is not retained).";
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = choices[0]?.message?.content;
    if (typeof content === "string" && content.trim()) return content;
  }

  // Error payloads are surfaced by `getErrorMessage`; don't duplicate them here.
  return null;
}

/**
 * A `POST /v1/guard/check` row: NORIX ruled on the message and the caller's own
 * model produced the answer. There is no model name and no completion to show.
 */
export function isPolicyCheck(path?: string | null): boolean {
  return Boolean(path?.endsWith("/guard/check"));
}

/**
 * Model traffic only — see `isInferenceTrafficSql` for the SQL twin and the
 * reason this filter exists.
 */
export function isInferenceTraffic(path?: string | null): boolean {
  if (!path) return false;
  return (
    path.endsWith("/chat/completions") ||
    path.endsWith("/completions") ||
    path.endsWith("/embeddings") ||
    path.endsWith("/messages") ||
    // Policy checks carry a real allow/block decision even though NORIX never
    // called a model — they are the whole point of the product, not overhead.
    path.endsWith("/guard/check")
  );
}
