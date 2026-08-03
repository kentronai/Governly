-- Link each agent to a LangSmith tracing project so the agent's Observability
-- tab can show only that agent's runs. `langsmith_project` is the LangSmith
-- session/project id used to filter runs; `langsmith_project_name` is the human
-- label shown in the UI. Idempotent — hand-authored after the 0017 snapshot
-- boundary, following the 0031–0034 convention.

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "langsmith_project" text;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "langsmith_project_name" text;
