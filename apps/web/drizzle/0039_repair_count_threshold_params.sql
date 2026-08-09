-- Repair count-style guard thresholds that were seeded below their minimum.
--
-- `pii.detect` and `profanity.detect` take a threshold that is a MATCH COUNT
-- (minimum number of PII instances / profane words needed to trigger), not a
-- 0.0-1.0 confidence score. The gateway validators (PIIDetectParams and
-- ProfanityDetectParams, both `ge=1.0`) reject anything below 1.
--
-- `apps/web/scripts/seed-marketplace.ts` seeded pii.detect with
-- `threshold: 0`, so every policy that added PII Detection from the catalog
-- inherited an invalid default and policy creation failed with:
--   "Invalid parameters for pii.detect: threshold Input should be greater
--    than or equal to 1"
--
-- This clamps the stored defaults, and the params already copied onto existing
-- policy bindings, up to 1. Idempotent: the WHERE clauses match only rows that
-- are still out of range.

UPDATE "guardrails"
SET
  "default_params" = jsonb_set("default_params", '{threshold}', '1'::jsonb, true),
  "updated_at" = NOW()
WHERE "key" IN ('pii.detect', 'pii.detect_pii', 'profanity.detect')
  AND "default_params" ? 'threshold'
  AND jsonb_typeof("default_params" -> 'threshold') = 'number'
  AND ("default_params" ->> 'threshold')::numeric < 1;

UPDATE "policy_guardrails" AS pg
SET
  "params" = jsonb_set(pg."params", '{threshold}', '1'::jsonb, true),
  "updated_at" = NOW()
FROM "guardrails" AS g
WHERE g."id" = pg."guardrail_id"
  AND g."key" IN ('pii.detect', 'pii.detect_pii', 'profanity.detect')
  AND pg."params" ? 'threshold'
  AND jsonb_typeof(pg."params" -> 'threshold') = 'number'
  AND (pg."params" ->> 'threshold')::numeric < 1;
