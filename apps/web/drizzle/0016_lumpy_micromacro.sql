ALTER TABLE "application_policies" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "applicability_status" text DEFAULT 'not_evaluated' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "compliance_status" text DEFAULT 'not_evaluated' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "coverage_score" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "evaluation" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "gaps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "application_policy_center" ADD COLUMN "evaluated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "policy_center" ADD COLUMN "control_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_center" ADD COLUMN "applicability_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- Preserve the application's existing Standard Policy selection as its
-- explicit runtime default. This removes the previous ambiguous use of
-- is_active and lets the gateway resolve one deterministic policy.
UPDATE "application_policies"
SET "is_default" = true
WHERE "policy_name" = 'Standard Policy' AND "is_active" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_application_policies_one_default"
ON "application_policies" ("application_id") WHERE "is_default" = true;
--> statement-breakpoint
-- Every regulation is backed by machine-readable controls. These rows are
-- evaluated against application documentation, ownership, risk, model,
-- testing, agent and runtime-observability evidence; React never invents the
-- requirements or compliance result.
UPDATE "policy_center"
SET "control_mappings" = '[
  {"key":"application_scope_documented","title":"Application scope documented","required":true},
  {"key":"use_case_documented","title":"Intended use and business impact documented","required":true},
  {"key":"risk_register","title":"Risks identified and mitigation tracked","required":true},
  {"key":"responsible_owner","title":"Responsible owner and stakeholders assigned","required":true},
  {"key":"model_inventory","title":"Models and technical details inventoried","required":true},
  {"key":"runtime_policy_configured","title":"Runtime guardrail policy configured","required":true},
  {"key":"runtime_monitoring","title":"Runtime requests monitored with audit evidence","required":true},
  {"key":"policy_execution_verified","title":"Configured guardrails verified in runtime evidence","required":true},
  {"key":"record_keeping","title":"Governance records maintained","required":true}
]'::jsonb
WHERE "name" <> 'California AB 2830';
--> statement-breakpoint
UPDATE "policy_center"
SET "control_mappings" = "control_mappings" || '[
  {"key":"human_oversight","title":"Human oversight and escalation established","required":true},
  {"key":"data_governance","title":"Data governance documented","required":true},
  {"key":"red_team_testing","title":"Independent testing or red-team evidence available","required":true}
]'::jsonb
WHERE "name" IN (
  'ISO/IEC 42001', 'ISO/IEC 23894', 'NIST AI Risk Management Framework',
  'EU AI Act (Regulation 2024/1689)', 'Artificial Intelligence and Data Act (AIDA)',
  'UK AI White Paper', 'Australian AI Ethics Principles', 'AI Verify Framework'
);
--> statement-breakpoint
UPDATE "policy_center"
SET "control_mappings" = "control_mappings" || '[
  {"key":"bias_assessment","title":"Bias and discrimination assessment completed","required":true},
  {"key":"transparency_notice","title":"Affected-person transparency notice documented","required":true},
  {"key":"human_oversight","title":"Human review and accommodation process established","required":true}
]'::jsonb
WHERE "name" IN (
  'Colorado AI Act SB 205', 'Colorado SB21-169',
  'EEOC Technical Assistance on ADA and AI', 'Illinois HB3773', 'NYC Local Law 144'
);
--> statement-breakpoint
UPDATE "policy_center"
SET "control_mappings" = "control_mappings" || '[
  {"key":"transparency_notice","title":"Synthetic-content disclosure process documented","required":true}
]'::jsonb
WHERE "name" = 'California AB 2839 — Election Deepfakes';
--> statement-breakpoint
UPDATE "policy_center"
SET "control_mappings" = '[]'::jsonb,
    "applicability_rules" = '[{"type":"never","reason":"AB 2830 is not an AI regulation; retained only to prevent miscitation."}]'::jsonb
WHERE "name" = 'California AB 2830';
