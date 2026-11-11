-- Trust Dossier: vendors a tenant tracks. Idempotent.
CREATE TABLE IF NOT EXISTS "trust_dossier_tracked" (
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "vendor_slug" text NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "vendor_slug")
);
