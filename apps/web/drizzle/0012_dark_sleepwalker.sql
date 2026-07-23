CREATE TYPE "public"."agent_platform" AS ENUM('aws_bedrock', 'aws_lambda', 'aws_step_functions', 'amazon_q', 'other');--> statement-breakpoint
CREATE TYPE "public"."agent_recommendation_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."agent_resource_type" AS ENUM('bedrock_agent', 'bedrock_agent_alias', 'knowledge_base', 'guardrail', 'prompt', 'lambda_function', 'step_function', 'cloudwatch_log_group', 'iam_role', 'secrets_manager_secret', 'api_gateway_api', 'eventbridge_rule');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'inactive', 'dormant');--> statement-breakpoint
CREATE TYPE "public"."autonomy_level" AS ENUM('L1', 'L2', 'L3', 'L4');--> statement-breakpoint
CREATE TYPE "public"."aws_auth_method" AS ENUM('iam_role', 'access_key', 'cross_account');--> statement-breakpoint
CREATE TYPE "public"."discovery_scan_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rule_engine_type" AS ENUM('capability', 'autonomy', 'risk');--> statement-breakpoint
CREATE TABLE "agent_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"recommendation_type" text NOT NULL,
	"reason" text NOT NULL,
	"severity" "risk_level" NOT NULL,
	"suggested_fix" text NOT NULL,
	"status" "agent_recommendation_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"resource_type" "agent_resource_type" NOT NULL,
	"resource_arn" text,
	"resource_name" text,
	"region" text,
	"raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text,
	"engine_type" "rule_engine_type" NOT NULL,
	"rule_key" text NOT NULL,
	"description" text NOT NULL,
	"condition" jsonb NOT NULL,
	"weight" numeric(6, 2) DEFAULT '0' NOT NULL,
	"result_value" text,
	"severity" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agent_rules_tenant_key" UNIQUE("tenant_id","rule_key")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"application_id" uuid,
	"connection_id" uuid NOT NULL,
	"external_agent_id" text NOT NULL,
	"name" text NOT NULL,
	"platform" "agent_platform" NOT NULL,
	"region" text NOT NULL,
	"account_id" text NOT NULL,
	"model" text,
	"knowledge_base_id" text,
	"iam_role_arn" text,
	"credential_type" "credential_auth_type",
	"owner_user_id" text,
	"owner_source" text,
	"owner_confidence" numeric(5, 2),
	"business_function" text,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"autonomy_level" "autonomy_level",
	"autonomy_reason" text,
	"autonomy_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"autonomy_confidence" numeric(5, 2),
	"risk_score" numeric(5, 2),
	"risk_level" "risk_level",
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discovery_source" "agent_resource_type",
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_status" "sync_status" DEFAULT 'success' NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agents_connection_external_id" UNIQUE("connection_id","external_agent_id")
);
--> statement-breakpoint
CREATE TABLE "aws_discovery_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"auth_method" "aws_auth_method" NOT NULL,
	"region" text NOT NULL,
	"role_arn" text,
	"external_id" text,
	"cross_account_role_arn" text,
	"encrypted_access_key_id" text,
	"encrypted_secret_access_key" text,
	"last_validated_at" timestamp with time zone,
	"last_validation_error" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discovery_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "discovery_scan_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"next_scan_at" timestamp with time zone,
	"agents_discovered" integer DEFAULT 0 NOT NULL,
	"resources_scanned" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"triggered_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_resources" ADD CONSTRAINT "agent_resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_resources" ADD CONSTRAINT "agent_resources_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rules" ADD CONSTRAINT "agent_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rules" ADD CONSTRAINT "agent_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_rules" ADD CONSTRAINT "agent_rules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."aws_discovery_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_discovery_connections" ADD CONSTRAINT "aws_discovery_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_discovery_connections" ADD CONSTRAINT "aws_discovery_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_discovery_connections" ADD CONSTRAINT "aws_discovery_connections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD CONSTRAINT "discovery_scans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD CONSTRAINT "discovery_scans_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."aws_discovery_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD CONSTRAINT "discovery_scans_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_recommendations_tenant" ON "agent_recommendations" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_recommendations_agent" ON "agent_recommendations" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_recommendations_status" ON "agent_recommendations" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_resources_tenant" ON "agent_resources" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_resources_agent" ON "agent_resources" USING btree ("agent_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_resources_type" ON "agent_resources" USING btree ("resource_type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_rules_tenant" ON "agent_rules" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agent_rules_engine" ON "agent_rules" USING btree ("engine_type" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_tenant" ON "agents" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_application" ON "agents" USING btree ("application_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_connection" ON "agents" USING btree ("connection_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_risk_level" ON "agents" USING btree ("risk_level" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_autonomy_level" ON "agents" USING btree ("autonomy_level" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_agents_owner" ON "agents" USING btree ("owner_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_aws_connections_tenant" ON "aws_discovery_connections" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_discovery_scans_tenant" ON "discovery_scans" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_discovery_scans_connection" ON "discovery_scans" USING btree ("connection_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_discovery_scans_created" ON "discovery_scans" USING btree ("created_at" timestamptz_ops);