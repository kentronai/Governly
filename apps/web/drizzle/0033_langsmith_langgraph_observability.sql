-- LangSmith runs/traces and LangGraph execution graphs, synced from the
-- provider APIs through self-hosted Nango and consumed by the Observability
-- dashboard. Idempotent (IF NOT EXISTS) — hand-authored after the 0017 snapshot
-- boundary, following the 0031/0032 convention.

CREATE TABLE IF NOT EXISTS "langsmith_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "integration_id" uuid NOT NULL,
  "external_run_id" text NOT NULL,
  "trace_id" text,
  "parent_run_id" text,
  "name" text,
  "run_type" text,
  "status" text,
  "project_name" text,
  "model" text,
  "system_prompt" text,
  "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "memory" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "total_tokens" integer,
  "total_cost" numeric,
  "latency_ms" integer,
  "error_message" text,
  "start_time" timestamp with time zone,
  "end_time" timestamp with time zone,
  "langsmith_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "langgraph_graphs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "integration_id" uuid NOT NULL,
  "graph_id" text NOT NULL,
  "name" text,
  "nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "langgraph_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" text NOT NULL,
  "integration_id" uuid NOT NULL,
  "graph_id" text,
  "graph_name" text,
  "thread_id" text,
  "external_run_id" text NOT NULL,
  "status" text,
  "execution_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "state_transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "node_io" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timing" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "langsmith_runs" ADD CONSTRAINT "langsmith_runs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "langsmith_runs" ADD CONSTRAINT "langsmith_runs_integration_id_fkey"
    FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "langgraph_graphs" ADD CONSTRAINT "langgraph_graphs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "langgraph_graphs" ADD CONSTRAINT "langgraph_graphs_integration_id_fkey"
    FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "langgraph_executions" ADD CONSTRAINT "langgraph_executions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "langgraph_executions" ADD CONSTRAINT "langgraph_executions_integration_id_fkey"
    FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_langsmith_runs_integration_external"
  ON "langsmith_runs" USING btree ("integration_id","external_run_id");
CREATE INDEX IF NOT EXISTS "idx_langsmith_runs_tenant_start"
  ON "langsmith_runs" USING btree ("tenant_id","start_time" DESC);
CREATE INDEX IF NOT EXISTS "idx_langsmith_runs_trace"
  ON "langsmith_runs" USING btree ("trace_id");
CREATE INDEX IF NOT EXISTS "idx_langsmith_runs_parent"
  ON "langsmith_runs" USING btree ("parent_run_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_langgraph_graphs_integration_graph"
  ON "langgraph_graphs" USING btree ("integration_id","graph_id");
CREATE INDEX IF NOT EXISTS "idx_langgraph_graphs_tenant"
  ON "langgraph_graphs" USING btree ("tenant_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_langgraph_executions_integration_external"
  ON "langgraph_executions" USING btree ("integration_id","external_run_id");
CREATE INDEX IF NOT EXISTS "idx_langgraph_executions_tenant_started"
  ON "langgraph_executions" USING btree ("tenant_id","started_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_langgraph_executions_thread"
  ON "langgraph_executions" USING btree ("thread_id");
