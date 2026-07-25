ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'crewai';
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'crewai_deployment';
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'crewai_crew';
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'crewai_agent';
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'crewai_task';
