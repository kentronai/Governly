ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'databricks_apps';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'databricks_jobs';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'databricks_genie';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_app';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_job';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_notebook';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_genie_space';
--> statement-breakpoint
UPDATE "integrations"
SET
  "description" = 'Discovers deployed agents across Databricks Apps, Model Serving, Genie, Jobs, and workspace notebooks, with Unity Catalog governance evidence.',
  "updated_at" = now()
WHERE "name" = 'Databricks Unity Catalog';
