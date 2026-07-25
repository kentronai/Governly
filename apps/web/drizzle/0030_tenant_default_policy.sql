ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "is_tenant_default" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "idx_policies_tenant_default" ON "policies" ("tenant_id") WHERE "is_tenant_default" = true;
