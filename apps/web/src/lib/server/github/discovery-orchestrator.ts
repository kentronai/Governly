/**
 * Discovers AI agents from a customer's GitHub repositories and fills their
 * registry profile (framework, LLMs, skills, packages, observability,
 * applications access, developer, deployer, deployed).
 *
 * A repo that is the source of an agent already found in AWS is merged into
 * that agent rather than listed twice; every other agent-like repo becomes its
 * own `github` agent (deployed or "code only", depending on deployment
 * evidence). Cheap pre-check first: a repo is only deep-scanned when its
 * dependency manifests show an agent framework or LLM SDK.
 */

import { and, eq, ne, notInArray } from "drizzle-orm";
import {
  agentPolicyEvaluations,
  agentRecommendations,
  agentResources,
  agents,
  db,
  discoveryScans,
  integrations,
  policyFindings,
} from "@db";
import {
  buildRepoProfile,
  detectFramework,
  detectLlmProviders,
  extractEnvKeys,
  extractModelIds,
  importedPackages,
  extractMcpServers,
  extractSkillsFromPaths,
  isAgentRepo,
  detectDeployTargets,
  extractIacAppNames,
  isDeployConfig,
  sameIacApp,
  isManifestPath,
  matchRepoToAgent,
  mergeProfiles,
  parseManifest,
  readProfile,
  type ParsedPackage,
  type RepoEvidence,
} from "@/lib/server/agents/agent-profile";
import { buildCapabilityFacts } from "@/lib/server/agents/capability-engine";
import { classifyAutonomy } from "@/lib/server/agents/autonomy-engine";
import { assessRisk } from "@/lib/server/agents/risk-engine";
import { detectOwnership } from "@/lib/server/agents/ownership-engine";
import { generateRecommendations } from "@/lib/server/agents/recommendations-engine";
import { syncAgentPolicyEvaluations } from "@/lib/server/policy-enforcement/agent-policy-sync";
import type { CorrelatedAgent } from "@/lib/server/aws/correlation";
import { hostedDeploysByRepo, type HostedDeploy } from "./hosting";
import {
  commitAuthor,
  hasCommit,
  isLive,
  getBlobText,
  getDevelopers,
  getLatestDeployment,
  getTree,
  listRepos,
  type GithubConnection,
  type GithubRepo,
  type GithubTreeEntry,
} from "./api-client";

/** The integration row that stores a GitHub connection (any GitHub provider). */
export interface GithubIntegrationRow {
  id: string;
  nangoConnectionId?: string | null;
  nangoProviderConfigKey?: string | null;
  configuration?: unknown;
}

const MAX_REPOS = 60;
const REPO_CONCURRENCY = 4;
const SOURCE_SAMPLE = 8;
// Config formats too: agents are often declared in JSON/TOML/YAML (model, tools).
const SOURCE_FILE = /\.(py|ts|tsx|js|mjs|yaml|yml|json|jsonc|toml)$/i;
const SOURCE_HINT = /agent|main|app|config|settings|llm|model|tool|server|index|crew|graph|bot|prompt/i;
const SOURCE_SKIP = /(^|\/)(node_modules|vendor|dist|build|\.venv|venv|tests?|__tests__|migrations)\/|\.(test|spec|min)\.|lock/i;

const isEnvExample = (p: string) => /(^|\/)\.env\.(example|sample|template)$/i.test(p);
const isMcpConfig = (p: string) => /(^|\/)\.?mcp\.json$/i.test(p) || /\.cursor\/mcp\.json$/i.test(p);
const isWorkflow = (p: string) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(p);

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** One agent inside a repo: the whole repo, or one folder of a multi-agent repo. */
interface RepoAgent {
  /** "" for the whole repo, else the agent's folder, e.g. "agents/travel-agent". */
  dir: string;
  evidence: RepoEvidence;
}

const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/**
 * Folders that are separate agents. A repo with its own root manifest is one
 * app (a workspace monorepo included); one with no root manifest and several
 * folders that each carry their own manifest is a collection of agents.
 */
export function agentFolders(paths: string[]): string[] {
  const dirs = Array.from(new Set(paths.filter(isManifestPath).map(dirOf)));
  if (dirs.includes("")) return [""];
  const top = dirs.filter((d) => !dirs.some((o) => o !== d && d.startsWith(`${o}/`)));
  return top.length >= 2 ? top.sort() : [""];
}

/**
 * Reads one repo and returns one evidence per agent it holds (none when it is
 * not an agent). Stage 1 reads only dependency manifests; stage 2 (config,
 * source, deployment, contributors) runs only for folders that look like agents.
 */
async function gatherEvidence(
  conn: GithubConnection,
  repo: GithubRepo,
  hosted: Map<string, HostedDeploy>,
): Promise<RepoAgent[]> {
  const tree = await getTree(conn, repo);
  if (!tree) return [];
  const all = tree.filter((e) => e.type === "blob");
  const folders = agentFolders(all.map((e) => e.path));
  // Who/where/when is per repo: fetched once, shared by its agents.
  let repoFacts: ReturnType<typeof repoDeployFacts> | null = null;
  const out: RepoAgent[] = [];
  for (const dir of folders) {
    const blobs = dir ? all.filter((e) => e.path.startsWith(`${dir}/`)) : all;
    repoFacts ??= repoDeployFacts(conn, repo, hosted, all);
    const evidence = await folderEvidence(conn, repo, blobs, all, () => repoFacts!, folders.length > 1);
    if (evidence) out.push({ dir, evidence });
  }
  return out;
}

/** Pick the app's live URL; exported for tests. */
export function pickAppUrl(homepage: string | null | undefined, texts: string[]): string | null {
  let root: string | null = null;
  try {
    root = homepage ? new URL(homepage).hostname.split(".").slice(-2).join(".") : null;
  } catch {
    root = null;
  }
  if (!root) return homepage ?? null;
  const onDomain = Array.from(
    new Set(
      texts.flatMap((t) => t.match(/https:\/\/[a-z0-9.-]+/gi) ?? []).filter((u) => {
        const host = new URL(u).hostname;
        return host === root || host.endsWith(`.${root}`);
      }),
    ),
  );
  // The product's app lives on an app./dashboard./console. host; the bare domain is often marketing.
  return onDomain.find((u) => /^https:\/\/(app|dashboard|console|portal)\./i.test(u)) ?? homepage ?? null;
}

/**
 * The deployed app's URL: the repo's website (GitHub "homepage"), refined to
 * the app host on the same domain when the README, changelog, env example or
 * a manifest names one (e.g. owluc.com -> app.owluc.com).
 */
async function appUrl(conn: GithubConnection, repo: GithubRepo, all: GithubTreeEntry[]) {
  if (!repo.homepage) return null;
  const files = all
    .filter((e) => /^(README|CHANGELOG)[^/]*$/i.test(e.path) || isEnvExample(e.path) || /(^|\/)manifest\.json$/i.test(e.path))
    .slice(0, 6);
  const texts = (await Promise.all(files.map((e) => getBlobText(conn, repo, e)))).filter(
    (t): t is string => Boolean(t),
  );
  return pickAppUrl(repo.homepage, texts);
}

async function repoDeployFacts(
  conn: GithubConnection,
  repo: GithubRepo,
  hosted: Map<string, HostedDeploy>,
  all: GithubTreeEntry[],
) {
  const targets = detectDeployTargets(all.map((e) => e.path));
  const pushDeployed = targets.filter((t) => /^(Render|Vercel|Netlify|Railway|AWS Amplify)$/.test(t));
  const [ghDeployment, developer, liveUrl, live] = await Promise.all([
    getLatestDeployment(conn, repo, pushDeployed.length > 0),
    getDevelopers(conn, repo),
    targets.length ? appUrl(conn, repo, all) : Promise.resolve(null),
  ]).then(async ([d, dev, url]) => [d, dev, url, url ? await isLive(url) : null] as const);
  // Repos deployed by Render/Vercel leave no GitHub deployment: use the host's
  // record, and the live commit's author as the deployer when none is recorded.
  const host = hosted.get(repo.full_name.toLowerCase());
  const hostedDeployer =
    host && !host.deployer && host.commit ? await commitAuthor(conn, repo.full_name, host.commit) : host?.deployer ?? null;
  let deployment: { deployer: string | null; deployedAt: string | null; deployedOn: string | null } | null =
    host?.deployedAt && (!ghDeployment || host.deployedAt > ghDeployment.deployedAt)
      ? { deployer: hostedDeployer, deployedAt: host.deployedAt, deployedOn: host.deployedOn }
      : ghDeployment;
  // Auto-deploy hosts (render.yaml, vercel.json…) deploy every push to the
  // default branch, so whoever pushed last is the deployer. The time stays
  // unconfirmed until the host itself is connected.
  // ponytail: assumes auto-deploy is on; read the host's flag if it matters.
  if (!deployment && !host && pushDeployed.length) {
    const pusher = await commitAuthor(conn, repo.full_name, repo.default_branch);
    if (pusher) deployment = { deployer: `${pusher} (last push to ${repo.default_branch})`, deployedAt: null, deployedOn: null };
  }
  // Name the host, and the live URL, rather than the CI system that built it.
  if (deployment && targets.length && !host) {
    deployment = {
      ...deployment,
      deployedOn: `${targets[0]}${live && liveUrl ? ` · ${liveUrl}` : ""}`,
    };
  }
  return { deployment, developer, host, live };
}

async function folderEvidence(
  conn: GithubConnection,
  repo: GithubRepo,
  blobs: GithubTreeEntry[],
  all: GithubTreeEntry[],
  repoFacts: () => ReturnType<typeof repoDeployFacts>,
  isFolder: boolean,
): Promise<RepoEvidence | null> {
  const paths = blobs.map((e) => e.path);
  const skillNames = extractSkillsFromPaths(paths);

  const packages: ParsedPackage[] = [];
  for (const entry of blobs.filter((e) => isManifestPath(e.path)).slice(0, 6)) {
    const text = await getBlobText(conn, repo, entry);
    if (text) packages.push(...parseManifest(entry.path, text));
  }
  const read = async (entries: GithubTreeEntry[]) =>
    (await Promise.all(entries.map((e) => getBlobText(conn, repo, e)))).filter(
      (t): t is string => Boolean(t),
    );

  // ponytail: a folder agent reads fewer files to keep a 25-agent repo inside
  // GitHub's hourly API budget; cache by tree sha if more depth is needed.
  const sources = blobs
    .filter((e) => SOURCE_FILE.test(e.path) && (isFolder || SOURCE_HINT.test(e.path)) && !SOURCE_SKIP.test(e.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)
    .slice(0, isFolder ? 3 : SOURCE_SAMPLE);
  const deployFiles = all.filter((e) => isDeployConfig(e.path)).slice(0, 4);
  const deployTexts = await Promise.all(deployFiles.map((e) => getBlobText(conn, repo, e)));
  const iacNames = extractIacAppNames(
    Object.fromEntries(deployFiles.map((e, i) => [e.path, deployTexts[i] ?? ""])),
  );
  const [sourceTexts, envTexts, workflowTexts, mcpTexts] = await Promise.all([
    read(sources),
    read(blobs.filter((e) => isEnvExample(e.path)).slice(0, 2)),
    read(blobs.filter((e) => isWorkflow(e.path)).slice(0, 4)),
    read(blobs.filter((e) => isMcpConfig(e.path)).slice(0, 2)),
  ]);

  // What the code imports counts like a declared dependency.
  const declared = new Set(packages.map((p) => p.name));
  for (const name of importedPackages(sourceTexts)) {
    if (!declared.has(name) && (detectFramework([name]) || detectLlmProviders([name]).length)) {
      packages.push({ name, version: null });
    }
  }
  const names = packages.map((p) => p.name);
  const modelIds = extractModelIds([...sourceTexts, ...envTexts].join("\n"));
  if (!detectFramework(names) && !detectLlmProviders(names).length && !modelIds.length && !skillNames.length) {
    return null;
  }

  const { deployment, developer, host, live } = await repoFacts();

  const evidence: RepoEvidence = {
    fullName: repo.full_name,
    description: repo.description,
    topics: repo.topics ?? [],
    packages,
    envKeys: Array.from(
      new Set([...envTexts, ...sourceTexts, ...workflowTexts].flatMap(extractEnvKeys)),
    ),
    // Workflows are included so a model pinned in CI config is still found.
    sourceTexts: [...sourceTexts, ...workflowTexts, ...envTexts],
    mcpServers: mcpTexts.flatMap(extractMcpServers),
    skillNames,
    developer,
    deployer: deployment?.deployer ?? null,
    deployed: host ? host.running : (live ?? Boolean(deployment?.deployedAt)),
    deployedAt: deployment?.deployedAt ?? null,
    deployedOn: deployment?.deployedOn ?? null,
    deployTargets: detectDeployTargets(all.map((e) => e.path)),
    iacNames,
  };
  return isAgentRepo(evidence) ? evidence : null;
}

function toCorrelatedAgent(repo: GithubRepo, key: string, name: string): CorrelatedAgent {
  return {
    externalAgentId: key,
    name,
    platform: "github",
    region: "github",
    discoverySource: "github_repository",
    resources: [
      {
        resourceType: "github_repository",
        resourceId: key,
        resourceArn: null,
        resourceName: key,
        region: "github",
        tags: {},
        lastUpdatedAt: repo.pushed_at,
        metadata: { defaultBranch: repo.default_branch, fork: repo.fork },
      },
    ],
  };
}

/** Removes an agent row and everything that references it (no FK cascade). */
async function removeAgent(agentId: string) {
  await db.delete(agentPolicyEvaluations).where(eq(agentPolicyEvaluations.agentId, agentId));
  await db.delete(policyFindings).where(eq(policyFindings.agentId, agentId));
  await db.delete(agentResources).where(eq(agentResources.agentId, agentId));
  await db.delete(agentRecommendations).where(eq(agentRecommendations.agentId, agentId));
  await db.delete(agents).where(eq(agents.id, agentId));
}

export async function runGithubDiscoveryScan(
  tenantId: string,
  integrationId: string,
  connection: GithubIntegrationRow,
  triggeredBy: string | null,
) {
  const [scan] = await db
    .insert(discoveryScans)
    .values({
      tenantId,
      integrationId,
      status: "running",
      startedAt: new Date().toISOString(),
      triggeredBy,
    })
    .returning();

  try {
    if (!connection.nangoConnectionId || !connection.nangoProviderConfigKey) {
      throw new Error("GitHub connection has no Nango credential");
    }
    const conn: GithubConnection = {
      connectionId: connection.nangoConnectionId,
      providerConfigKey: connection.nangoProviderConfigKey,
    };
    const repos = await listRepos(conn, MAX_REPOS);
    if (repos.length === 0) {
      throw new Error("No repositories are visible to this GitHub connection");
    }

    const hosted = await hostedDeploysByRepo(tenantId);
    const found: Array<{ repo: GithubRepo; dir: string; evidence: RepoEvidence }> = [];
    await mapLimit(repos, REPO_CONCURRENCY, async (repo) => {
      for (const unit of await gatherEvidence(conn, repo, hosted)) found.push({ repo, ...unit });
    });

    const now = new Date().toISOString();
    const cloudAgents = await db
      .select({
        id: agents.id,
        name: agents.name,
        profile: agents.profile,
        rawMetadata: agents.rawMetadata,
      })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), ne(agents.platform, "github")));
    const existingRepoRows = await db
      .select({ id: agents.id, externalAgentId: agents.externalAgentId })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.integrationId, integrationId)));

    const ownRepoNames: string[] = [];
    let linked = 0;

    for (const { repo, dir, evidence } of found) {
      // A folder agent is keyed owner/repo/folder and named after its folder.
      const key = dir ? `${repo.full_name}/${dir}` : repo.full_name;
      const agentName = dir ? dir.split("/").pop()! : repo.name;
      if (dir) {
        const whole = existingRepoRows.find((r) => r.externalAgentId === repo.full_name);
        if (whole) {
          await removeAgent(whole.id);
          existingRepoRows.splice(existingRepoRows.indexOf(whole), 1);
        }
      }
      const repoProfile = buildRepoProfile(evidence);
      // Which cloud agents this repo is the code of, from strongest proof:
      // 1. the deployed image is tagged with a commit of this repo;
      // 2. the repo's deploy config names the IaC app the cloud resources carry
      //    (SST app, CloudFormation stack, Serverless service…) — every agent of
      //    that app is linked; 3. an explicit repo tag or identical name.
      const targets: Array<(typeof cloudAgents)[number]> = [];
      for (const candidate of dir ? [] : cloudAgents) {
        const cp = readProfile(candidate.profile);
        const shas = cp.packages
          .map((p) => p.match(/:([0-9a-f]{40})$/)?.[1])
          .filter((x): x is string => Boolean(x));
        let hit = false;
        for (const sha of Array.from(new Set(shas)).slice(0, 3)) {
          if (await hasCommit(conn, repo.full_name, sha)) {
            hit = true;
            break;
          }
        }
        if (!hit && cp.iacApp && (evidence.iacNames ?? []).some((n) => sameIacApp(n, cp.iacApp!))) hit = true;
        if (hit) targets.push(candidate);
      }
      if (!targets.length) {
        const byName = matchRepoToAgent(key, cloudAgents);
        if (byName) targets.push(byName);
      }
      const target = targets[0] ?? null;

      if (target) {
        // The repo is the source of these cloud agents: enrich them instead.
        for (const t of targets) {
          const raw = (t.rawMetadata ?? {}) as { cloudProfile?: unknown };
          const cloud = readProfile(raw.cloudProfile ?? t.profile);
          const profile = mergeProfiles(cloud, repoProfile);
          await db
            .update(agents)
            .set({
              profile,
              model: profile.llms[0] ?? undefined,
              rawMetadata: {
                ...(t.rawMetadata as object),
                githubProfile: repoProfile,
                cloudProfile: cloud,
              },
              updatedAt: now,
            })
            .where(eq(agents.id, t.id));
        }
        const stale = existingRepoRows.find((r) => r.externalAgentId === key);
        if (stale) await removeAgent(stale.id);
        linked += 1;
        continue;
      }

      ownRepoNames.push(key);
      const agent = toCorrelatedAgent(repo, key, agentName);
      const ownership = await detectOwnership(agent);
      const facts = buildCapabilityFacts(agent, ownership.ownerUserId);
      const autonomy = await classifyAutonomy(tenantId, facts);
      const risk = await assessRisk(tenantId, facts);
      const recommendations = generateRecommendations(facts, autonomy, ownership);
      const existing = existingRepoRows.find((r) => r.externalAgentId === key);

      const values = {
        tenantId,
        connectionId: null,
        azureConnectionId: null,
        integrationId,
        externalAgentId: key,
        name: agentName,
        platform: "github" as const,
        region: "github",
        accountId: repo.owner.login,
        model: repoProfile.llms[0] ?? null,
        knowledgeBaseId: null,
        iamRoleArn: null,
        credentialType: null,
        ownerUserId: ownership.ownerUserId,
        ownerSource: ownership.ownerSource,
        ownerConfidence: String(ownership.ownerConfidence),
        businessFunction: ownership.businessFunction,
        status: (repoProfile.deployed ? "active" : "inactive") as "active" | "inactive",
        lastUsedAt: repoProfile.deployedAt,
        capabilities: facts,
        autonomyLevel: autonomy.level,
        autonomyReason: autonomy.reason,
        autonomyEvidence: autonomy.evidence,
        autonomyConfidence: String(autonomy.confidence),
        autonomyClassifiedAt: now,
        riskScore: String(risk.score),
        riskLevel: risk.level,
        riskFactors: risk.factors,
        discoverySource: "github_repository" as const,
        lastSeenAt: now,
        syncStatus: "success" as const,
        profile: repoProfile,
        rawMetadata: {
          provider: "github",
          evidenceSource: "github_repository_scan",
          repository: repo.full_name,
          defaultBranch: repo.default_branch,
          lastPushedAt: repo.pushed_at,
        },
        updatedAt: now,
      };

      let agentId: string;
      if (existing) {
        agentId = existing.id;
        await db.update(agents).set(values).where(eq(agents.id, agentId));
      } else {
        const [created] = await db
          .insert(agents)
          .values({ ...values, firstSeenAt: now })
          .returning();
        agentId = created.id;
      }
      await db.delete(agentResources).where(eq(agentResources.agentId, agentId));
      await db.insert(agentResources).values(
        agent.resources.map((item) => ({
          tenantId,
          agentId,
          resourceType: item.resourceType,
          resourceArn: item.resourceArn,
          resourceName: item.resourceName,
          region: item.region,
          rawData: { ...item.metadata, lastUpdatedAt: item.lastUpdatedAt },
        })),
      );
      await db
        .delete(agentRecommendations)
        .where(and(eq(agentRecommendations.agentId, agentId), eq(agentRecommendations.status, "open")));
      if (recommendations.length) {
        await db.insert(agentRecommendations).values(
          recommendations.map((item) => ({
            tenantId,
            agentId,
            recommendationType: item.recommendationType,
            reason: item.reason,
            severity: item.severity,
            suggestedFix: item.suggestedFix,
          })),
        );
      }
      await syncAgentPolicyEvaluations(tenantId, agentId);
    }

    // Repos that are gone (or no longer look like agents) retire, never delete.
    await db
      .update(agents)
      .set({ status: "inactive", updatedAt: now })
      .where(
        and(
          eq(agents.integrationId, integrationId),
          ...(ownRepoNames.length
            ? [notInArray(agents.externalAgentId, ownRepoNames)]
            : []),
        ),
      );

    const resourcesScanned = { github_repository: repos.length };
    const agentsDiscovered = ownRepoNames.length + linked;
    await db
      .update(discoveryScans)
      .set({ status: "completed", finishedAt: now, agentsDiscovered, resourcesScanned, errorMessage: null })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(integrations)
      .set({
        isEnabled: true,
        isCredentialsAdded: true,
        lastSyncAt: now,
        syncStatus: "success",
        errorMessage: null,
        configuration: {
          ...((connection.configuration as object) ?? {}),
          lastAgentsDiscovered: agentsDiscovered,
          lastReposScanned: repos.length,
        },
        updatedAt: now,
      })
      .where(eq(integrations.id, integrationId));

    return {
      scanId: scan.id,
      status: "completed" as const,
      agentsDiscovered,
      resourcesScanned,
      errorMessage: undefined as string | undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub discovery failed";
    await db
      .update(discoveryScans)
      .set({ status: "failed", finishedAt: new Date().toISOString(), errorMessage: message })
      .where(eq(discoveryScans.id, scan.id));
    await db
      .update(integrations)
      .set({ syncStatus: "failed", errorMessage: message })
      .where(eq(integrations.id, integrationId));
    return {
      scanId: scan.id,
      status: "failed" as const,
      agentsDiscovered: 0,
      resourcesScanned: {},
      errorMessage: message,
    };
  }
}
