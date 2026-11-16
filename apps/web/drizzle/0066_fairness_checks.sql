-- Fairness checks on a risk: group metrics computed from a model's decisions (src/lib/fairness.ts).
-- Only the summary is stored; the uploaded decision file never leaves the browser. Idempotent.
CREATE TABLE IF NOT EXISTS "fairness_checks" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "risk_id" uuid NOT NULL REFERENCES "risks"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "file_name" text NOT NULL,
  "group_column" text NOT NULL,
  "decision_column" text NOT NULL,
  "positive_value" text NOT NULL,
  "label_column" text,
  "result" jsonb NOT NULL,
  "passed" boolean NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_fairness_checks_risk" ON "fairness_checks" ("tenant_id", "risk_id");
