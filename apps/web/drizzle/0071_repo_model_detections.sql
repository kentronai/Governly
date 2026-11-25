-- Models found in a tenant's connected GitHub repos (src/lib/server/github/model-scan.ts).
-- One row per (model, repo, file). Approval is computed against provider_models at read time;
-- status only records a dismissal. Idempotent.
CREATE TABLE IF NOT EXISTS "repo_model_detections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "model_id" text NOT NULL,
  "kind" text NOT NULL,
  "repo" text NOT NULL,
  "file_path" text NOT NULL,
  "line" integer,
  "status" text DEFAULT 'open' NOT NULL,
  "first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_repo_model_detection" UNIQUE ("tenant_id", "model_id", "repo", "file_path")
);
CREATE INDEX IF NOT EXISTS "idx_repo_model_detections_tenant" ON "repo_model_detections" ("tenant_id");
