-- Self-hosted Nango shares NORIX's own postgres server but uses a SEPARATE
-- database so its ~40 tables never mix with the app's `ai_governance` tables.
-- Runs once, only on a fresh postgres data volume (docker-entrypoint-initdb.d).
-- For an already-initialised volume, create it manually:
--   docker compose exec postgres createdb -U postgres nango
SELECT 'CREATE DATABASE nango'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nango')\gexec
