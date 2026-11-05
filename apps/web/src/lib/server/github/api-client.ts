/**
 * Read-only GitHub client. All calls go through the self-hosted Nango Proxy, so
 * NORIX never sees the token: it holds only the `connectionId` +
 * `providerConfigKey` of whichever GitHub provider the admin enabled
 * (`github-pat`, `github` OAuth, `github-app`, `github-app-oauth`).
 *
 * Every helper is best-effort and returns null on failure: a repo that
 * 404s, is empty, or lacks Actions access must not abort the whole scan.
 */

import { proxy } from "@/lib/server/nango/client";
export { isGithubProviderKey } from "@/lib/integrations/categories";

export interface GithubConnection {
  connectionId: string;
  providerConfigKey: string;
}

export interface GithubRepo {
  full_name: string;
  name: string;
  default_branch: string;
  description: string | null;
  topics?: string[];
  archived: boolean;
  fork: boolean;
  pushed_at: string | null;
  /** The repo's "Website" field, e.g. the deployed app's URL. */
  homepage?: string | null;
  owner: { login: string };
}

export interface GithubTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

async function get<T>(
  conn: GithubConnection,
  endpoint: string,
  params?: Record<string, string | number>,
): Promise<T | null> {
  // Nango's proxy rate-limits per connection (429): wait and retry instead of
  // treating a throttled read as "file missing" and silently dropping agents.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await proxy<T>({
        connectionId: conn.connectionId,
        providerConfigKey: conn.providerConfigKey,
        endpoint,
        params,
      });
      return res.data;
    } catch (e) {
      if ((e as { status?: number }).status !== 429 || attempt >= 5) return null;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

// GitHub Apps list repos through the installation; every other flavour through
// the authenticated user.
const usesInstallation = (conn: GithubConnection) =>
  conn.providerConfigKey === "github-app";

/** Most recently pushed, non-archived repos the connection can read. */
export async function listRepos(
  conn: GithubConnection,
  max = 100,
): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  for (let page = 1; repos.length < max && page <= 5; page += 1) {
    const params = { per_page: 100, page, sort: "pushed" } as Record<string, string | number>;
    if (!usesInstallation(conn)) {
      params.affiliation = "owner,collaborator,organization_member";
    }
    const data = await get<GithubRepo[] | { repositories: GithubRepo[] }>(
      conn,
      usesInstallation(conn) ? "/installation/repositories" : "/user/repos",
      params,
    );
    const batch = Array.isArray(data) ? data : (data?.repositories ?? []);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos
    .filter((r) => !r.archived)
    .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, max);
}

export async function getTree(
  conn: GithubConnection,
  repo: GithubRepo,
): Promise<GithubTreeEntry[] | null> {
  const data = await get<{ tree?: GithubTreeEntry[] }>(
    conn,
    `/repos/${repo.full_name}/git/trees/${encodeURIComponent(repo.default_branch)}`,
    { recursive: 1 },
  );
  return data?.tree ?? null;
}

const MAX_BLOB_BYTES = 120_000;

export async function getBlobText(
  conn: GithubConnection,
  repo: GithubRepo,
  entry: GithubTreeEntry,
): Promise<string | null> {
  if ((entry.size ?? 0) > MAX_BLOB_BYTES) return null;
  const data = await get<{ content?: string; encoding?: string }>(
    conn,
    `/repos/${repo.full_name}/git/blobs/${entry.sha}`,
  );
  if (!data?.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content, "base64").toString("utf8");
}

export interface RepoDeployment {
  deployer: string | null;
  deployedAt: string;
  deployedOn: string;
}

/**
 * Latest evidence that the repo is actually deployed: a successful GitHub
 * Deployment (environment + creator), else a successful deploy/release
 * workflow run on the default branch (actor).
 */
export async function getLatestDeployment(
  conn: GithubConnection,
  repo: GithubRepo,
  /** The repo deploys to a host that pulls a built image/artifact, so the build workflow is the deploy. */
  buildIsDeploy = false,
): Promise<RepoDeployment | null> {
  // Newest deployment that actually went live. A later deploy marks earlier
  // ones "inactive", so inactive still means "was successfully deployed".
  const deployments = await get<
    Array<{ id: number; environment: string; created_at: string; creator?: { login: string } | null }>
  >(conn, `/repos/${repo.full_name}/deployments`, { per_page: 10 });
  for (const d of deployments ?? []) {
    const statuses = await get<Array<{ state: string; created_at: string; environment_url?: string }>>(
      conn,
      `/repos/${repo.full_name}/deployments/${d.id}/statuses`,
      { per_page: 10 },
    );
    const live = statuses?.find((s) => s.state === "success" || s.state === "inactive");
    if (live) {
      return {
        deployer: d.creator?.login ?? null,
        deployedAt: live.created_at,
        deployedOn: `GitHub · ${d.environment}${live.environment_url ? ` · ${live.environment_url}` : ""}`,
      };
    }
  }

  const runs = await get<{
    workflow_runs?: Array<{
      name: string | null;
      path: string;
      run_started_at: string | null;
      actor?: { login: string } | null;
      triggering_actor?: { login: string } | null;
    }>;
  }>(conn, `/repos/${repo.full_name}/actions/runs`, {
    status: "success",
    branch: repo.default_branch,
    per_page: 30,
  });
  const run = runs?.workflow_runs?.find((r) =>
    (buildIsDeploy ? /deploy|release|publish|\bcd\b|docker|image|container/i : /deploy|release|publish|\bcd\b/i).test(
      `${r.name ?? ""} ${r.path}`,
    ),
  );
  return run
    ? {
        deployer: run.triggering_actor?.login ?? run.actor?.login ?? null,
        deployedAt: run.run_started_at ?? new Date().toISOString(),
        deployedOn: `GitHub Actions · ${run.name ?? run.path}`,
      }
    : null;
}

/** Top human contributors, falling back to the repo owner. */
export async function getDevelopers(
  conn: GithubConnection,
  repo: GithubRepo,
): Promise<string> {
  const people = await get<Array<{ login: string; type?: string }>>(
    conn,
    `/repos/${repo.full_name}/contributors`,
    { per_page: 5 },
  );
  const humans = (people ?? [])
    .filter((p) => p.type !== "Bot" && !p.login.endsWith("[bot]"))
    .slice(0, 2)
    .map((p) => p.login);
  return humans.length ? humans.join(", ") : repo.owner.login;
}

/** True when `sha` is a commit of this repo (used to prove a deployed image came from it). */
export async function hasCommit(conn: GithubConnection, repoFullName: string, sha: string): Promise<boolean> {
  return Boolean(await get<{ sha: string }>(conn, `/repos/${repoFullName}/commits/${sha}`));
}

/** GitHub login of the commit's author, e.g. who pushed what a host deployed. */
export async function commitAuthor(conn: GithubConnection, repoFullName: string, sha: string): Promise<string | null> {
  const c = await get<{ author?: { login: string } | null; commit?: { author?: { name?: string } } }>(
    conn,
    `/repos/${repoFullName}/commits/${sha}`,
  );
  return c?.author?.login ?? c?.commit?.author?.name ?? null;
}

/**
 * True when the repo's public website answers, i.e. the app is running.
 * Only public https hosts are probed (no IPs / localhost) so a repo field can't
 * aim NORIX at internal addresses.
 * ponytail: hostname check only; resolve + block private ranges if hardened SSRF is needed.
 */
export async function isLive(url: string | null | undefined): Promise<boolean | null> {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !u.hostname.includes(".") || /^(localhost|\d+(\.\d+){3}|\[)/i.test(u.hostname)) {
    return null;
  }
  try {
    const res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8_000), cache: "no-store" });
    await res.body?.cancel();
    return res.status < 500;
  } catch {
    return false;
  }
}
