ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'aws_eks';
ALTER TYPE "public"."agent_platform" ADD VALUE IF NOT EXISTS 'kubernetes';
