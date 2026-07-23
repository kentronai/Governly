ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'aws_ec2';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'azure_virtual_machines';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'azure_container_apps';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'azure_aks';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'gcp_vertex_ai';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'gcp_cloud_run';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'gcp_compute';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'gcp_gke';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'gcp_functions';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'ec2_instance';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'azure_virtual_machine';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'azure_container_app';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'azure_aks_cluster';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'gcp_vertex_reasoning_engine';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'gcp_cloud_run_service';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'gcp_compute_instance';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'gcp_gke_cluster';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'gcp_cloud_function';
--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD COLUMN "integration_id" uuid;
--> statement-breakpoint
CREATE INDEX "idx_discovery_scans_integration" ON "discovery_scans" USING btree ("integration_id" uuid_ops);
--> statement-breakpoint
ALTER TABLE "discovery_scans" ADD CONSTRAINT "discovery_scans_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
