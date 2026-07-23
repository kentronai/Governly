ALTER TYPE "public"."agent_platform" ADD VALUE 'azure_openai' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE 'azure_ai_foundry' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE 'azure_functions' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE 'azure_logic_apps' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_openai_account';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_ai_foundry_project';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_function';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_logic_app';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_managed_identity';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_storage_account';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_key_vault';--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE 'azure_api_management';--> statement-breakpoint
CREATE TABLE "azure_discovery_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text DEFAULT 'Azure' NOT NULL,
	"azure_tenant_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"client_id" text NOT NULL,
	"encrypted_client_secret" text NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_validation_error" text,
	"last_scan_at" timestamp with time zone,
	"last_scan_status" text,
	"last_scan_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_azure_connections_tenant_subscription" UNIQUE("tenant_id","subscription_id")
);
--> statement-breakpoint
CREATE TABLE "compliance_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"application_id" uuid,
	"policy_id" text,
	"control_key" text NOT NULL,
	"scope" text DEFAULT 'application' NOT NULL,
	"evidence_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"external_url" text,
	"file_name" text,
	"mime_type" text,
	"file_size" integer,
	"file_content_base64" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_scans" ALTER COLUMN "connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "azure_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD COLUMN "azure_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "azure_discovery_connections" ADD CONSTRAINT "azure_discovery_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_discovery_connections" ADD CONSTRAINT "azure_discovery_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "azure_discovery_connections" ADD CONSTRAINT "azure_discovery_connections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_evidence" ADD CONSTRAINT "compliance_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_azure_connections_tenant" ON "azure_discovery_connections" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_compliance_evidence_tenant" ON "compliance_evidence" USING btree ("tenant_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_compliance_evidence_application" ON "compliance_evidence" USING btree ("application_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_compliance_evidence_policy_control" ON "compliance_evidence" USING btree ("policy_id" text_ops,"control_key" text_ops);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_azure_connection_id_fkey" FOREIGN KEY ("azure_connection_id") REFERENCES "public"."azure_discovery_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD CONSTRAINT "discovery_scans_azure_connection_id_fkey" FOREIGN KEY ("azure_connection_id") REFERENCES "public"."azure_discovery_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agents_azure_connection" ON "agents" USING btree ("azure_connection_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_discovery_scans_azure_connection" ON "discovery_scans" USING btree ("azure_connection_id" uuid_ops);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "uq_agents_azure_connection_external_id" UNIQUE("azure_connection_id","external_agent_id");