ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'databricks_model_serving';
--> statement-breakpoint
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'databricks_unity_catalog';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_serving_endpoint';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_registered_model';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_catalog';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_schema';
--> statement-breakpoint
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'databricks_table';
