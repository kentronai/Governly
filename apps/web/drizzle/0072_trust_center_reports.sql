-- AI Trust Center report (issue #37). Idempotent.
-- Admin-editable settings (contacts, cadence, methodology, framework and sub-processor notes).
CREATE TABLE IF NOT EXISTS "trust_center_settings" (
  "tenant_id" text PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Customer data training policy: one row per published version; the report uses the latest.
CREATE TABLE IF NOT EXISTS "trust_center_training_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "policy_id" text NOT NULL,
  "version" text NOT NULL,
  "effective_date" date NOT NULL,
  "owner" text NOT NULL,
  "statement" text DEFAULT '' NOT NULL,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_center_training_policies_tenant" ON "trust_center_training_policies" ("tenant_id", "created_at");
--> statement-breakpoint
-- Generated reports. The PDF is stored AES-256-GCM encrypted (lib/server/crypto); downloads stop at expires_at.
CREATE TABLE IF NOT EXISTS "trust_center_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "report_id" text NOT NULL UNIQUE,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "generated_by" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "sections" text[] NOT NULL,
  "options" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "file_encrypted" text NOT NULL,
  "file_size" integer NOT NULL,
  "shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trust_center_reports_tenant" ON "trust_center_reports" ("tenant_id", "created_at");
--> statement-breakpoint
-- Untracking a vendor now soft-removes it so reports can list "previously used" sub-processors.
ALTER TABLE "trust_dossier_tracked" ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone;
