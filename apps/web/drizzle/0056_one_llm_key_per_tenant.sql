-- BYOK: a tenant keeps ONE provider/model/key. Keep the most recently saved one, drop the rest,
-- then enforce it so a second key can never be added.
DELETE FROM "tenant_llm_keys" k
USING (
  SELECT DISTINCT ON ("tenant_id") "tenant_id", "provider", "model_id"
  FROM "tenant_llm_keys"
  ORDER BY "tenant_id", "updated_at" DESC
) keep
WHERE k."tenant_id" = keep."tenant_id"
  AND NOT (k."provider" = keep."provider" AND k."model_id" = keep."model_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_llm_keys_one_per_tenant" ON "tenant_llm_keys" ("tenant_id");
