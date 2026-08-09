/**
 * Semantics of guardrail parameters that the generic parameter editor cannot
 * infer from a value's type alone.
 *
 * Not every `threshold` is a 0.0-1.0 confidence score. `pii.detect` and
 * `profanity.detect` take a MATCH COUNT — the minimum number of PII instances
 * or profane words needed to trigger a violation — and the gateway validators
 * (`PIIDetectParams` / `ProfanityDetectParams`, both `ge=1.0`) reject anything
 * below 1. Editing those with a 0-1 slider produced params the API refused:
 * "Invalid parameters for pii.detect: threshold Input should be greater than
 * or equal to 1".
 */

export type ThresholdKind = "count" | "score";

/** Guard keys whose `threshold` is a match count (minimum 1), not a score. */
const COUNT_THRESHOLD_GUARD_KEYS: ReadonlySet<string> = new Set([
  "pii.detect",
  "pii.detect_pii",
  "profanity.detect",
]);

/** How a guard's `threshold` parameter should be edited and validated. */
export function getThresholdKind(guardrailKey?: string): ThresholdKind {
  return guardrailKey && COUNT_THRESHOLD_GUARD_KEYS.has(guardrailKey)
    ? "count"
    : "score";
}

/** Input constraints + helper text for a numeric guard parameter. */
export function getNumericParamConfig(
  guardrailKey: string | undefined,
  paramKey: string,
  defaultValue: number
): { min?: number; max?: number; step: string; hint: string } {
  if (!paramKey.includes("threshold")) {
    return { step: "1", hint: `Default: ${defaultValue}` };
  }

  if (getThresholdKind(guardrailKey) === "count") {
    return {
      min: 1,
      step: "1",
      hint: "Minimum number of matches to trigger (1 or more)",
    };
  }

  return {
    min: 0,
    max: 1,
    step: "0.01",
    hint: "0.0 to 1.0 (higher = stricter)",
  };
}
