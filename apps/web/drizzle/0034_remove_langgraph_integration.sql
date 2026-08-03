-- Remove the standalone LangGraph integration. LangGraph is a framework, not a
-- hosted service you authenticate against, so it is no longer presented as an
-- external integration. Observability now derives LangGraph execution details
-- on the fly from LangSmith traces, so the separately-synced graph/execution
-- tables and the catalog row are dropped. Idempotent — hand-authored after the
-- 0017 snapshot boundary, following the 0031/0032/0033 convention.

DROP TABLE IF EXISTS "langgraph_executions";
DROP TABLE IF EXISTS "langgraph_graphs";

-- Drop the per-tenant "LangGraph" marketplace catalog rows (and anything that
-- referenced them via ON DELETE CASCADE).
DELETE FROM "integrations" WHERE "name" = 'LangGraph';
