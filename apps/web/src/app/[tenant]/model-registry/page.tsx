/**
 * Model Registry Page (Server Component with SSR)
 * Organization-approved API models catalog
 */

import { auth } from "@clerk/nextjs/server";
import { getModelRegistryRuntime } from "@/lib/server/model-registry/runtime";
import { ModelRegistryList } from "./_components/ModelRegistryList";
import { RepoModelsSection } from "./_components/RepoModelsSection";
import { listRepoModels } from "@/lib/actions/repo-models";
import { tenantHasConnectedGithub } from "@/lib/server/github/model-scan";

interface ModelRegistryPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function ModelRegistryPage({
  params,
}: ModelRegistryPageProps) {
  const { tenant } = await params;
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  // Initialize the tenant's executable test model idempotently, then return
  // tenant-scoped models together with persistent selection/connection state.
  const [models, repoModels, githubConnected] = await Promise.all([
    getModelRegistryRuntime(orgId),
    listRepoModels(),
    tenantHasConnectedGithub(orgId),
  ]);

  return (
    <div className="p-6">
      <ModelRegistryList
        initialModels={models as any}
        tenant={tenant}
        tenantId={orgId}
        userId={userId}
      />
      <RepoModelsSection tenant={tenant} rows={githubConnected ? repoModels : []} githubConnected={githubConnected} />
    </div>
  );
}
