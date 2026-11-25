-- Shadow AI: who first reported a machine and when, and how the latest scan arrived
-- ("browser" = Scan this computer, otherwise the scan key's name, e.g. "Shadow AI Jamf fleet"). Idempotent.
ALTER TABLE "machine_scans" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone;
ALTER TABLE "machine_scans" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE "machine_scans" ADD COLUMN IF NOT EXISTS "reported_via" text;
UPDATE "machine_scans" SET "created_at" = "scanned_at" WHERE "created_at" IS NULL;
UPDATE "machine_scans" SET "created_by" = "uploaded_by" WHERE "created_by" IS NULL;
ALTER TABLE "machine_scans" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "machine_scans" ALTER COLUMN "created_at" SET NOT NULL;
