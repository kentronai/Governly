-- Shadow AI: latest AI environment scan per machine (public/shadow-ai-scan.py).
-- Each upload replaces that machine's row, so the table is "what each machine looks like now". Idempotent.
CREATE TABLE IF NOT EXISTS "machine_scans" (
  "tenant_id" text NOT NULL,
  "machine_id" text NOT NULL,
  "hostname" text NOT NULL,
  "platform" text NOT NULL,
  "uploaded_by" text NOT NULL,
  "result" jsonb NOT NULL,
  "scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("tenant_id", "machine_id")
);
