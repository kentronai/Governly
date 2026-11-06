/**
 * Where a repository is deployed when the host is not AWS/Azure/GCP: Render
 * and Vercel deploy straight from GitHub and record the deploy only in their
 * own API. Read through the tenant's Nango connection to each host and keyed
 * by "owner/repo" so the GitHub scan can attach it to the right agent.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, integrations } from "@db";
import { proxy } from "@/lib/server/nango/client";
import { normalizeRepoRef } from "@/lib/server/agents/agent-profile";

export interface HostedDeploy {
  host: string;
  deployedOn: string;
  deployedAt: string | null;
  /** The host's own ID for the service/project: shown as the agent ID. */
  serviceId: string | null;
  running: boolean;
  /** Person who triggered it when the host records one (Vercel). */
  deployer: string | null;
  /** Commit that is live, to resolve its author on GitHub when no deployer is recorded. */
  commit: string | null;
}

async function call<T>(conn: { connectionId: string; providerConfigKey: string }, baseUrlOverride: string, endpoint: string, params?: Record<string, string | number>) {
  try {
    return (await proxy<T>({ ...conn, endpoint, params, baseUrlOverride })).data;
  } catch {
    return null;
  }
}

type RenderService = { service: { id: string; name: string; repo?: string; suspended?: string; serviceDetails?: { url?: string } } };
type RenderDeploy = { deploy: { status: string; finishedAt?: string | null; createdAt?: string; commit?: { id?: string } } };

async function renderDeploys(conn: { connectionId: string; providerConfigKey: string }, out: Map<string, HostedDeploy>) {
  const base = "https://api.render.com";
  const services = (await call<RenderService[]>(conn, base, "/v1/services", { limit: 100 })) ?? [];
  for (const { service } of services) {
    const repo = normalizeRepoRef(service.repo)?.toLowerCase();
    if (!repo) continue;
    const deploys = (await call<RenderDeploy[]>(conn, base, `/v1/services/${service.id}/deploys`, { limit: 10 })) ?? [];
    const live = deploys.find((d) => d.deploy.status === "live") ?? deploys.find((d) => d.deploy.finishedAt);
    const at = live?.deploy.finishedAt ?? live?.deploy.createdAt ?? null;
    const prev = out.get(repo);
    if (prev && prev.deployedAt && at && prev.deployedAt > at) continue;
    out.set(repo, {
      host: "Render",
      deployedOn: `Render · ${service.serviceDetails?.url ?? service.name}`,
      deployedAt: at,
      serviceId: service.id,
      running: service.suspended !== "suspended" && live?.deploy.status === "live",
      deployer: null,
      commit: live?.deploy.commit?.id ?? null,
    });
  }
}

type VercelDeployment = {
  url: string;
  created: number;
  state?: string;
  projectId?: string;
  creator?: { username?: string };
  meta?: { githubCommitOrg?: string; githubCommitRepo?: string; githubCommitSha?: string };
};

async function vercelDeploys(conn: { connectionId: string; providerConfigKey: string }, out: Map<string, HostedDeploy>) {
  const data = await call<{ deployments?: VercelDeployment[] }>(conn, "https://api.vercel.com", "/v6/deployments", {
    limit: 100,
    target: "production",
    state: "READY",
  });
  for (const d of data?.deployments ?? []) {
    if (!d.meta?.githubCommitOrg || !d.meta.githubCommitRepo) continue;
    const repo = `${d.meta.githubCommitOrg}/${d.meta.githubCommitRepo}`.toLowerCase();
    const at = new Date(d.created).toISOString();
    const prev = out.get(repo);
    if (prev && prev.deployedAt && prev.deployedAt > at) continue;
    out.set(repo, {
      host: "Vercel",
      deployedOn: `Vercel · https://${d.url}`,
      deployedAt: at,
      serviceId: d.projectId ?? null,
      running: true,
      deployer: d.creator?.username ?? null,
      commit: d.meta.githubCommitSha ?? null,
    });
  }
}

/** Latest Render/Vercel deploy per GitHub repo across the tenant's connected hosts. */
export async function hostedDeploysByRepo(tenantId: string): Promise<Map<string, HostedDeploy>> {
  const out = new Map<string, HostedDeploy>();
  const rows = await db
    .select({ key: integrations.nangoProviderConfigKey, connectionId: integrations.nangoConnectionId })
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        inArray(integrations.nangoProviderConfigKey, ["render-mcp", "render", "vercel"]),
        isNotNull(integrations.nangoConnectionId),
      ),
    );
  for (const row of rows) {
    const conn = { connectionId: row.connectionId!, providerConfigKey: row.key! };
    if (row.key === "vercel") await vercelDeploys(conn, out);
    else await renderDeploys(conn, out);
  }
  return out;
}
