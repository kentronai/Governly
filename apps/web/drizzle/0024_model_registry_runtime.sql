CREATE TABLE IF NOT EXISTS "tenant_model_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "provider_model_id" uuid NOT NULL,
  "is_selected" boolean DEFAULT false NOT NULL,
  "connection_status" text DEFAULT 'not_tested' NOT NULL,
  "connection_error_code" text,
  "connection_message" text,
  "last_tested_at" timestamp with time zone,
  "selected_by" text,
  "selected_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_tenant_model_settings_model" UNIQUE("tenant_id", "provider_model_id"),
  CONSTRAINT "chk_tenant_model_settings_connection_status"
    CHECK ("connection_status" IN ('not_tested', 'testing', 'ready', 'error')),
  CONSTRAINT "tenant_model_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
  CONSTRAINT "tenant_model_settings_provider_model_id_fkey"
    FOREIGN KEY ("provider_model_id") REFERENCES "public"."provider_models"("id") ON DELETE cascade,
  CONSTRAINT "tenant_model_settings_selected_by_fkey"
    FOREIGN KEY ("selected_by") REFERENCES "public"."users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_model_settings_tenant"
  ON "tenant_model_settings" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_model_settings_model"
  ON "tenant_model_settings" USING btree ("provider_model_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_model_settings_selected"
  ON "tenant_model_settings" USING btree ("tenant_id")
  WHERE "is_selected" = true;
