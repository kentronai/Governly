"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, integrations, providerModels, repoModelDetections, users } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { isGithubProviderKey } from "@/lib/integrations/categories";
import { scanReposForModels } from "@/lib/server/github/model-scan";
import { guessProvider, isApproved, type ModelHit } from "@/lib/server/github/model-detector";
import { createProviderModel } from "@/lib/actions/provider-models";

async function ctx() {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");
  return { tenantId: orgId, userId };
}

export interface RepoModelLocation {
  id: string;
  repo: string;
  filePath: string;
  line: number | null;
}

export interface RepoModelRow {
  modelId: string;
  kind: ModelHit["kind"];
  provider: string;
  approved: boolean;
  dismissed: boolean;
  repos: string[];
  locations: RepoModelLocation[];
  firstDetectedAt: string;
  lastDetectedAt: string;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

/** Detected models grouped by model id, with approval computed against the registry. */
export async function listRepoModels(): Promise<RepoModelRow[]> {
  const { tenantId } = await ctx();
  const [rows, approved] = await Promise.all([
    db.select().from(repoModelDetections).where(eq(repoModelDetections.tenantId, tenantId)),
    db.select({ modelId: providerModels.modelId }).from(providerModels).where(eq(providerModels.tenantId, tenantId)),
  ]);
  const approvedIds = approved.map((a) => a.modelId);
  const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x))];
  const names = new Map(
    (userIds.length
      ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds))
      : []
    ).map((u) => [u.id, u.name || u.email]),
  );
  const who = (id: string | null) => (id ? (names.get(id) ?? id) : "GitHub scan");

  const grouped = new Map<string, RepoModelRow>();
  for (const r of rows) {
    let g = grouped.get(r.modelId);
    if (!g) {
      const kind = r.kind as ModelHit["kind"];
      g = {
        modelId: r.modelId,
        kind,
        provider: guessProvider(r.modelId, kind),
        approved: isApproved(r.modelId, approvedIds),
        dismissed: true,
        repos: [],
        locations: [],
        firstDetectedAt: r.firstDetectedAt,
        lastDetectedAt: r.lastDetectedAt,
        createdBy: who(r.createdBy),
        createdAt: r.createdAt,
        updatedBy: who(r.updatedBy),
        updatedAt: r.updatedAt,
      };
      grouped.set(r.modelId, g);
    }
    g.dismissed &&= r.status === "dismissed";
    if (!g.repos.includes(r.repo)) g.repos.push(r.repo);
    g.locations.push({ id: r.id, repo: r.repo, filePath: r.filePath, line: r.line });
    if (r.firstDetectedAt < g.firstDetectedAt) g.firstDetectedAt = r.firstDetectedAt;
    if (r.lastDetectedAt > g.lastDetectedAt) g.lastDetectedAt = r.lastDetectedAt;
    if (r.updatedAt > g.updatedAt) {
      g.updatedAt = r.updatedAt;
      g.updatedBy = who(r.updatedBy);
    }
  }
  return [...grouped.values()].sort((a, b) => b.lastDetectedAt.localeCompare(a.lastDetectedAt));
}

/** Runs the model scan over every connected GitHub integration of the tenant. */
export async function scanRepoModels(tenant: string) {
  const { tenantId, userId } = await ctx();
  const rows = await db.select().from(integrations).where(eq(integrations.tenantId, tenantId));
  const gh = rows.filter((r) => isGithubProviderKey(r.nangoProviderConfigKey) && r.nangoConnectionId);
  if (!gh.length) return { status: false, message: "Connect a GitHub integration first." };
  let repos = 0;
  let detections = 0;
  for (const r of gh) {
    const res = await scanReposForModels(
      tenantId,
      { connectionId: r.nangoConnectionId!, providerConfigKey: r.nangoProviderConfigKey! },
      userId,
    );
    repos += res.repos;
    detections += res.detections;
  }
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "model.registry.repo_scan",
    targetType: "integration",
    targetId: gh[0].id,
    metadata: { repos, detections },
  });
  revalidatePath(`/${tenant}/model-registry`);
  return { status: true, message: `Scanned ${repos} repos, ${detections} model references found.` };
}

/** Approve = add to the Model Registry (approved models). */
export async function approveRepoModel(tenant: string, modelId: string, provider: string) {
  await ctx();
  const res = await createProviderModel({
    provider,
    modelId,
    displayName: modelId,
    category: provider === "custom" ? "1st_party" : "llm",
    ...(provider === "huggingface" ? { modelUrl: `https://huggingface.co/${modelId}` } : {}),
  });
  revalidatePath(`/${tenant}/model-registry`);
  return res;
}

export async function dismissRepoModel(tenant: string, modelId: string) {
  const { tenantId, userId } = await ctx();
  await db
    .update(repoModelDetections)
    .set({ status: "dismissed", updatedBy: userId, updatedAt: new Date().toISOString() })
    .where(and(eq(repoModelDetections.tenantId, tenantId), eq(repoModelDetections.modelId, modelId)));
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: "model.registry.repo_model_dismissed",
    targetType: "repo_model",
    targetId: modelId,
    metadata: {},
  });
  revalidatePath(`/${tenant}/model-registry`);
  return { status: true, message: `${modelId} dismissed` };
}
