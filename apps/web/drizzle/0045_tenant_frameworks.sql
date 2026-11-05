-- Catalog frameworks (ISO 42001, NIST AI RMF, SOC 2...) each tenant has enabled.
CREATE TABLE IF NOT EXISTS "tenant_frameworks" (
  "tenant_id" text NOT NULL,
  "slug" text NOT NULL,
  "enabled_by" text,
  "enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_frameworks_pkey" PRIMARY KEY ("tenant_id", "slug")
);
