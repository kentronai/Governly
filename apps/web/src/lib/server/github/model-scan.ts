/**
 * Scans a tenant's connected GitHub repos for ML/LLM model usage and upserts
 * one repo_model_detections row per (model, repo, file). Reuses the Nango-backed
 * GitHub client used by agent discovery.
 */

import { sql } from "drizzle-orm";
import { db, repoModelDetections } from "@db";
import { getBlobText, getTree, listRepos, type GithubConnection, type GithubRepo } from "./api-client";
import { detectModelFile, detectModelsInText, SCANNABLE_FILE, type ModelHit } from "./model-detector";

const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.venv|venv|\.next|__pycache__)\/|\.min\.|lock/i;
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
    const blobs = tree.filter((e) => e.type === "blob" && !SKIP.test(e.path));
    const hits: Array<ModelHit & { path: string }> = [];
    for (const e of blobs) {
      const f = detectModelFile(e.path);
      if (f) hits.push({ ...f, path: e.path });
    }
    const files = blobs.filter((e) => SCANNABLE_FILE.test(e.path)).slice(0, MAX_FILES_PER_REPO);
    for (const e of files) {
      const text = await getBlobText(conn, repo, e).catch(() => null);
      if (text) for (const h of detectModelsInText(text)) hits.push({ ...h, path: e.path });
    }
    if (!hits.length) continue;
    const now = new Date().toISOString();
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
          createdBy: userId,
          updatedBy: userId,
        })),
      )
      .onConflictDoUpdate({
        target: [repoModelDetections.tenantId, repoModelDetections.modelId, repoModelDetections.repo, repoModelDetections.filePath],
        set: { line: sql`excluded.line`, lastDetectedAt: now, updatedAt: now, updatedBy: userId },
      });
    detections += hits.length;
  }
  return { repos: list.length, detections };
}
