-- Risk catalog provenance + links from a risk to controls and policies. Idempotent.
ALTER TABLE "risk_list" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "risk_list" ADD COLUMN IF NOT EXISTS "source_id" text;
ALTER TABLE "risk_list" ADD COLUMN IF NOT EXISTS "source_ref" text;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_risk_list_source" ON "risk_list" ("source", "source_id");

-- target_type 'control': target_id is a framework leaf id "<framework-slug>:<key>" (src/lib/frameworks).
-- target_type 'policy': target_id is a policy_center.id.
CREATE TABLE IF NOT EXISTS "risk_links" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "risk_id" uuid NOT NULL REFERENCES "risks"("id") ON DELETE CASCADE,
  "target_type" text NOT NULL CHECK ("target_type" IN ('control', 'policy')),
  "target_id" text NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_risk_links" UNIQUE ("risk_id", "target_type", "target_id")
);
CREATE INDEX IF NOT EXISTS "idx_risk_links_target" ON "risk_links" ("tenant_id", "target_type", "target_id");
