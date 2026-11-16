-- Risk form split into "Risk" (assessment) and "Treatment" (mitigation). Idempotent.
-- use_case_ids: the application's use cases this risk applies to (use_case_id is kept for older code).
-- framework_slugs: frameworks/regulations it applies to (slugs from src/lib/frameworks).
-- residual_*: likelihood and severity after treatment; residual_level is derived on the server.
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "use_case_ids" uuid[] DEFAULT '{}' NOT NULL;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "framework_slugs" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "lifecycle_phase" text;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "potential_impact" text;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "review_notes" text;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "implementation_strategy" text;
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "residual_severity" "risk_severity";
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "residual_likelihood" "risk_likelihood";
ALTER TABLE "risks" ADD COLUMN IF NOT EXISTS "residual_level" "risk_level";
UPDATE "risks" SET "use_case_ids" = ARRAY["use_case_id"]
  WHERE "use_case_id" IS NOT NULL AND "use_case_ids" = '{}';
