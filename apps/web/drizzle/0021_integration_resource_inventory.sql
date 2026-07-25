CREATE TABLE "integration_discovered_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "integration_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_resource_id" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_name" text NOT NULL,
  "parent_resource_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_integration_discovered_resource" UNIQUE("integration_id","external_resource_id")
);
--> statement-breakpoint
CREATE INDEX "idx_integration_resources_tenant" ON "integration_discovered_resources" USING btree ("tenant_id" text_ops);
--> statement-breakpoint
CREATE INDEX "idx_integration_resources_integration" ON "integration_discovered_resources" USING btree ("integration_id" uuid_ops);
--> statement-breakpoint
CREATE INDEX "idx_integration_resources_type" ON "integration_discovered_resources" USING btree ("resource_type" text_ops);
--> statement-breakpoint
ALTER TABLE "integration_discovered_resources" ADD CONSTRAINT "integration_discovered_resources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "integration_discovered_resources" ADD CONSTRAINT "integration_discovered_resources_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;
