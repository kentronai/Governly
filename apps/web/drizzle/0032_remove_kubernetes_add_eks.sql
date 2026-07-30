-- EKS clusters are now discovered through the AWS connection (mirroring GKE on
-- GCP and AKS on Azure), so register the resource type. Idempotent.
ALTER TYPE "public"."agent_resource_type" ADD VALUE IF NOT EXISTS 'aws_eks_cluster';

-- Remove the standalone "Kubernetes Cluster" integration. Kubernetes clusters
-- are now discovered through the AWS/Azure/GCP cloud connections (EKS/AKS/GKE),
-- so the manual token-based integration is retired. Foreign keys cascade, so
-- deleting the integration rows also removes their agents, agent_resources,
-- agent_recommendations, and discovery_scans. Idempotent (no-op if absent).
DELETE FROM "integrations"
 WHERE "name" IN ('Kubernetes Cluster', 'Universal Agent Collector');
