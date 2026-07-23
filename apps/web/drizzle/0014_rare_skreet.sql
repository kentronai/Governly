ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "autonomy_classified_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "agents"
SET "autonomy_classified_at" = COALESCE("updated_at", "created_at")
WHERE "autonomy_level" IS NOT NULL AND "autonomy_classified_at" IS NULL;
