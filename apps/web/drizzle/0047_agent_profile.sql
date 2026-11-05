-- Agent Registry profile: applications access, developer, deployer, deployed,
-- observability, framework, LLMs, skills, packages. Filled by AWS + GitHub discovery.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TYPE "agent_platform" ADD VALUE IF NOT EXISTS 'github';
--> statement-breakpoint
ALTER TYPE "agent_resource_type" ADD VALUE IF NOT EXISTS 'github_repository';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agents_deployed" ON "agents" (("profile"->>'deployed'));
