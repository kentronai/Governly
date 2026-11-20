-- Datasets (test prompts) and Test Runs (a dataset run through an application's guardrails,
-- graded by Guardrail Checks and AI Quality Checks). Items and per-prompt results are jsonb. Idempotent.
CREATE TABLE IF NOT EXISTS "eval_datasets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "application_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "items" jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "eval_datasets_app_idx" ON "eval_datasets" ("tenant_id", "application_id");

CREATE TABLE IF NOT EXISTS "test_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "application_id" uuid NOT NULL,
  "name" text NOT NULL,
  "dataset_name" text NOT NULL,
  "items" jsonb NOT NULL,
  "config" jsonb NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "results" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "test_runs_app_idx" ON "test_runs" ("tenant_id", "application_id");
