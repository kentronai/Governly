/**
 * Scans a tenant's connected GitHub repos for ML/LLM model usage and upserts
 * one repo_model_detections row per (model, repo, file). Reuses the Nango-backed
 * GitHub client used by agent discovery.
 */

import { and, eq, lt, sql } from "drizzle-orm";
import { db, integrations, repoModelDetections } from "@db";
import { isGithubProviderKey } from "@/lib/integrations/categories";
import { getBlobText, getTree, listRepos, type GithubConnection, type GithubRepo } from "./api-client";
import { detectModelFile, detectModelsInText, MAX_MODELS_PER_FILE, NON_USAGE_PATH, SCANNABLE_FILE, type ModelHit } from "./model-detector";

type IntegrationLike = {
  nangoProviderConfigKey: string | null;
  nangoConnectionId: string | null;
  isCredentialsAdded: boolean | null;
};

/** Same "connected" rule as the Admin Center integrations page. */
export const hasConnectedGithub = (rows: IntegrationLike[]) =>
  rows.some((r) => isGithubProviderKey(r.nangoProviderConfigKey) && (r.isCredentialsAdded || Boolean(r.nangoConnectionId)));

export async function tenantHasConnectedGithub(tenantId: string) {
  return hasConnectedGithub(await db.select().from(integrations).where(eq(integrations.tenantId, tenantId)));
}

/** After a GitHub disconnect/delete: drop the tenant's repo model detections unless GitHub is still connected. */
export async function purgeRepoModelsIfGithubGone(tenantId: string) {
  if (await tenantHasConnectedGithub(tenantId)) return false;
  await db.delete(repoModelDetections).where(eq(repoModelDetections.tenantId, tenantId));
  return true;
}

// ponytail: per-repo file cap keeps Nango proxy calls bounded; raise or page if repos are large.
const MAX_FILES_PER_REPO = 150;

export async function scanReposForModels(
  tenantId: string,
  conn: GithubConnection,
  userId: string | null,
  repos?: GithubRepo[],
): Promise<{ repos: number; detections: number }> {
  const list = repos ?? (await listRepos(conn, 60));
  let detections = 0;
  for (const repo of list) {
    const tree = await getTree(conn, repo).catch(() => null);
    if (!tree) continue;
    const blobs = tree.filter((e) => e.type === "blob" && !NON_USAGE_PATH.test(e.path));
    const hits: Array<ModelHit & { path: string }> = [];
    for (const e of blobs) {
      const f = detectModelFile(e.path);
      if (f) hits.push({ ...f, path: e.path });
    }
    const files = blobs.filter((e) => SCANNABLE_FILE.test(e.path)).slice(0, MAX_FILES_PER_REPO);
    for (const e of files) {
      const text = await getBlobText(conn, repo, e).catch(() => null);
      const found = text ? detectModelsInText(text) : [];
      if (found.length <= MAX_MODELS_PER_FILE) for (const h of found) hits.push({ ...h, path: e.path });
    }
    const now = new Date().toISOString();
    // Drop this repo's rows the scan no longer sees (old test/example hits, removed code).
    // ponytail: files past MAX_FILES_PER_REPO count as "not seen"; page the tree if repos are large.
    const prune = () =>
      db.delete(repoModelDetections).where(
        and(eq(repoModelDetections.tenantId, tenantId), eq(repoModelDetections.repo, repo.full_name), lt(repoModelDetections.lastDetectedAt, now)),
      );
    if (!hits.length) {
      await prune();
      continue;
    }
    await db
      .insert(repoModelDetections)
      .values(
        hits.map((h) => ({
          tenantId,
          modelId: h.modelId,
          kind: h.kind,
          repo: repo.full_name,
          filePath: h.path,
          line: h.line,
          lastDetectedAt: now,
          createdBy: userId,
          updatedBy: userId,
        })),
      )
      .onConflictDoUpdate({
        target: [repoModelDetections.tenantId, repoModelDetections.modelId, repoModelDetections.repo, repoModelDetections.filePath],
        set: { line: sql`excluded.line`, lastDetectedAt: now, updatedAt: now, updatedBy: userId },
      });
    await prune();
    detections += hits.length;
  }
  return { repos: list.length, detections };
}
