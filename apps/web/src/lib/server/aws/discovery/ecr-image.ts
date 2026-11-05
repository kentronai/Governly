/**
 * Reads what an agent's container image actually ships, using the same AWS
 * credentials as the rest of discovery: skills (`skills/<name>/SKILL.md`),
 * dependency manifests, model ids / LLM providers named in source, the agent
 * runtime (image env), the source repository (`.git/config`) and when the
 * image was last pushed. Only the image's top, app-sized layers are read.
 *
 * Needs ecr:BatchGetImage, ecr:GetDownloadUrlForLayer, ecr:DescribeImages.
 */

import { gunzipSync } from "node:zlib";
import {
  BatchGetImageCommand,
  DescribeImagesCommand,
  GetDownloadUrlForLayerCommand,
  type ECRClient,
} from "@aws-sdk/client-ecr";
import {
  analyzeCodeBundle,
  extractSkillsFromPaths,
  isManifestPath,
  isSourcePath,
  normalizeRepoRef,
} from "../../agents/agent-profile";

const ECR_REF =
  /^(\d{12})\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com\/([^:@\s]+):([\w.-]+)$/;

export function parseEcrRef(ref: string) {
  const m = ref.match(ECR_REF);
  return m ? { registryId: m[1], region: m[2], repository: m[3], tag: m[4] } : null;
}

// App code sits in the last, small layers; base OS / node_modules layers are
// large and skipped. ponytail: size heuristic, no per-file layer index.
const MAX_LAYER_BYTES = 30_000_000;
const MAX_TOTAL_BYTES = 60_000_000;
const MAX_TEXT_FILES = 400;
const MAX_FILE_BYTES = 100_000;

/** Minimal ustar/pax reader over an uncompressed tar buffer. */
export function* tarEntries(buf: Buffer): Generator<{ path: string; type: string; data: Buffer }> {
  let offset = 0;
  let longName: string | null = null;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const str = (a: number, b: number) => header.subarray(a, b).toString("utf8").split("\0")[0];
    const size = parseInt(str(124, 136).trim() || "0", 8) || 0;
    const type = str(156, 157) || "0";
    const prefix = str(345, 500);
    const name = str(0, 100);
    const data = buf.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      const m = data.toString("utf8").match(/\d+ path=([^\n]*)\n/);
      longName = m ? m[1] : null;
      continue;
    }
    if (type === "L") {
      longName = data.toString("utf8").split("\0")[0];
      continue;
    }
    if (type === "g") continue;
    const path = (longName ?? (prefix ? `${prefix}/${name}` : name)).replace(/^\.\//, "");
    longName = null;
    yield { path, type, data };
  }
}

/**
 * Keep the models the code actually uses: a pricing table or model catalog
 * names dozens once each, the configured model is referenced repeatedly.
 * ponytail: occurrence count, not call-site analysis.
 */
export function rankModels(ids: string[], source: string, keep = 5): string[] {
  const count = (id: string) => source.split(id).length - 1;
  return ids
    .map((id) => ({ id, n: count(id) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, keep)
    .map((x) => x.id);
}

export interface ImageFacts {
  codePackages: { name: string; version: string | null }[];
  codeTools: string[];
  codeModelIds: string[];
  codeEnvKeys: string[];
  codeProviders: string[];
  codeApps: string[];
  codeSkills: string[];
  codeFrameworks: string[];
  codeRepository: string | null;
  codeImagePushedAt: string | null;
}

/** Agent runtimes recognised from the image's environment variable names. */
const RUNTIME_ENV: Array<[RegExp, string]> = [
  [/^CODEX_|_CODEX_/, "OpenAI Codex CLI"],
  [/^CLAUDE_CODE_|^CLAUDE_CONFIG_DIR$/, "Claude Code"],
];

// Facts per image digest, for the life of the server process: an image never
// changes under its digest, so the 5-minute scheduler re-reads nothing.
// ponytail: in-memory; persist to the DB if the web container restarts often.
const cache = new Map<string, ImageFacts>();

const denied = (e: unknown) =>
  /AccessDenied|not authorized/i.test(
    `${(e as { name?: string })?.name ?? ""} ${(e as { message?: string })?.message ?? ""}`,
  );

export async function inspectEcrImage(
  ecr: ECRClient,
  ref: string,
  gaps: string[],
): Promise<ImageFacts | null> {
  const parsed = parseEcrRef(ref);
  if (!parsed) return null;
  const { registryId, repository, tag } = parsed;
  try {
    const got = await ecr.send(
      new BatchGetImageCommand({
        registryId,
        repositoryName: repository,
        imageIds: [{ imageTag: tag }],
        acceptedMediaTypes: [
          "application/vnd.docker.distribution.manifest.v2+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.oci.image.index.v1+json",
        ],
      }),
    );
    let image = got.images?.[0];
    let manifest = JSON.parse(image?.imageManifest ?? "{}");
    // Multi-arch index: take the linux/amd64 image.
    if (Array.isArray(manifest.manifests)) {
      const pick =
        manifest.manifests.find((m: { platform?: { os?: string; architecture?: string } }) =>
          m.platform?.os === "linux" && m.platform?.architecture === "amd64") ?? manifest.manifests[0];
      const sub = await ecr.send(
        new BatchGetImageCommand({ registryId, repositoryName: repository, imageIds: [{ imageDigest: pick.digest }] }),
      );
      image = sub.images?.[0];
      manifest = JSON.parse(image?.imageManifest ?? "{}");
    }
    const digest = image?.imageId?.imageDigest ?? `${repository}:${tag}`;
    const hit = cache.get(digest);
    if (hit) return hit;

    const blob = async (layerDigest: string) => {
      const url = await ecr.send(
        new GetDownloadUrlForLayerCommand({ registryId, repositoryName: repository, layerDigest }),
      );
      const res = await fetch(url.downloadUrl!, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`layer ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    };

    const config = manifest.config?.digest
      ? (JSON.parse((await blob(manifest.config.digest)).toString("utf8")).config ?? {})
      : {};
    const imageEnvKeys: string[] = (config.Env ?? []).map((e: string) => e.split("=")[0]);

    const layers: Array<{ digest: string; size: number }> = [...(manifest.layers ?? [])].reverse();
    const paths: string[] = [];
    const texts: Record<string, string> = {};
    let total = 0;
    let textCount = 0;
    let gitConfig = "";
    for (const layer of layers) {
      if (layer.size > MAX_LAYER_BYTES || total + layer.size > MAX_TOTAL_BYTES) continue;
      total += layer.size;
      const tar = gunzipSync(await blob(layer.digest));
      for (const entry of tarEntries(tar)) {
        const p = entry.path.replace(/^\/+/, "");
        paths.push(entry.type === "5" && !p.endsWith("/") ? `${p}/` : p);
        if (entry.type !== "0" && entry.type !== "\0") continue;
        if (/(^|\/)\.git\/config$/.test(p)) gitConfig = entry.data.toString("utf8");
        if (entry.data.length > MAX_FILE_BYTES || /(^|\/)node_modules\//.test(p)) continue;
        // Manifests are matched by their last three path segments so a
        // monorepo's app/packages/x/package.json still counts; they never
        // compete with source files for the text budget.
        const tail = p.split("/").slice(-3).join("/");
        if (isManifestPath(tail)) texts[tail] = entry.data.toString("utf8");
        // Skill instructions name the systems the agent operates on.
        else if (/(^|\/)skills\/[^/]+\/SKILL\.md$/i.test(p) && !/(^|\/)\.cursor\//.test(p)) {
          texts[p] = entry.data.toString("utf8");
        }
        else if (textCount < MAX_TEXT_FILES && isSourcePath(p)) {
          texts[p] = entry.data.toString("utf8");
          textCount += 1;
        }
      }
    }

    const facts = analyzeCodeBundle(paths, texts);
    const pushed = await ecr
      .send(new DescribeImagesCommand({ registryId, repositoryName: repository, imageIds: [{ imageTag: tag }] }))
      .then((r) => r.imageDetails?.[0]?.imagePushedAt?.toISOString() ?? null)
      .catch((e) => {
        if (denied(e)) gaps.push("ecr:DescribeImages");
        return null;
      });

    const result: ImageFacts = {
      codePackages: facts.packages,
      codeTools: facts.tools,
      codeModelIds: rankModels(facts.modelIds, Object.values(texts).join("\n")),
      codeEnvKeys: [...new Set([...facts.envKeys, ...imageEnvKeys])],
      codeProviders: facts.providers,
      codeApps: facts.apps,
      // IDE assistant skills (.cursor/) belong to the developers, not the agent.
      codeSkills: extractSkillsFromPaths(paths.filter((p) => !/(^|\/)\.cursor\//.test(p))),
      codeFrameworks: RUNTIME_ENV.filter(([re]) => imageEnvKeys.some((k) => re.test(k))).map(([, l]) => l),
      codeRepository: normalizeRepoRef(gitConfig.match(/url\s*=\s*(\S+)/)?.[1] ?? null),
      codeImagePushedAt: pushed,
    };
    cache.set(digest, result);
    return result;
  } catch (e) {
    if (denied(e)) gaps.push("ecr:BatchGetImage / ecr:GetDownloadUrlForLayer");
    return null;
  }
}
