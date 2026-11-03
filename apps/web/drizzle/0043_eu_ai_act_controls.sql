-- Per-tenant EU AI Act requirement tracking. control_key is a requirement
-- ("1.1": owner/reviewer/approver/due date) or a subcontrol ("1.1.1":
-- implementation, status, evidence, auditor feedback, attachments).
CREATE TABLE IF NOT EXISTS "eu_ai_act_controls" (
  "tenant_id" text NOT NULL,
  "control_key" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "control_key")
);
