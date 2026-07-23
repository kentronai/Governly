ALTER TABLE "observability_logs" ADD COLUMN "agent_id" uuid;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "integration_id" uuid;
--> statement-breakpoint
CREATE INDEX "idx_observability_agent" ON "observability_logs" USING btree ("agent_id" uuid_ops);
--> statement-breakpoint
ALTER TABLE "observability_logs" ADD CONSTRAINT "observability_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "uq_agents_integration_external_id" UNIQUE("integration_id","external_agent_id");
--> statement-breakpoint
CREATE INDEX "idx_agents_integration" ON "agents" USING btree ("integration_id" uuid_ops);
--> statement-breakpoint
CREATE TABLE "agent_policy_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"policy_type" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_name" text NOT NULL,
	"assignment_source" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"compliance_status" text DEFAULT 'not_evaluated' NOT NULL,
	"coverage_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"evaluation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evaluated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agent_policy_evaluation" UNIQUE("agent_id","policy_type","policy_id")
);
--> statement-breakpoint
CREATE TABLE "policy_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" uuid,
	"application_id" uuid,
	"observability_log_id" uuid,
	"policy_type" text NOT NULL,
	"policy_id" text NOT NULL,
	"source" text NOT NULL,
	"finding_key" text NOT NULL,
	"category" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_policy_finding_observation" UNIQUE("observability_log_id","finding_key")
);
--> statement-breakpoint
ALTER TABLE "agent_policy_evaluations" ADD CONSTRAINT "agent_policy_evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_policy_evaluations" ADD CONSTRAINT "agent_policy_evaluations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_findings" ADD CONSTRAINT "policy_findings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_findings" ADD CONSTRAINT "policy_findings_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_findings" ADD CONSTRAINT "policy_findings_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_findings" ADD CONSTRAINT "policy_findings_observability_log_id_fkey" FOREIGN KEY ("observability_log_id") REFERENCES "public"."observability_logs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_agent_policy_evaluations_tenant" ON "agent_policy_evaluations" USING btree ("tenant_id" text_ops);
--> statement-breakpoint
CREATE INDEX "idx_agent_policy_evaluations_agent" ON "agent_policy_evaluations" USING btree ("agent_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "idx_agent_policy_evaluations_status" ON "agent_policy_evaluations" USING btree ("compliance_status" text_ops);
--> statement-breakpoint
CREATE INDEX "idx_policy_findings_tenant_detected" ON "policy_findings" USING btree ("tenant_id" text_ops,"last_detected_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX "idx_policy_findings_agent" ON "policy_findings" USING btree ("agent_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "idx_policy_findings_application" ON "policy_findings" USING btree ("application_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "idx_policy_findings_status" ON "policy_findings" USING btree ("status" text_ops);
