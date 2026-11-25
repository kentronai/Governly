import "server-only";

import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, trustDossierRuns, trustDossierSubprocessors, trustDossierTracked } from "@db";
import { fetchSource } from "@/lib/server/radar/agent";
import { searchEnabled, searchUrls } from "@/lib/server/radar/search";
import { pickRadarModel, radarChat, type RadarModel } from "@/lib/server/radar/llm";
import { parseModelJson, sha256 } from "@/lib/server/radar/text";
import { TRUST_DOSSIER_VENDORS, type TrustDossierVendor } from "@/lib/trust-dossier/vendors";

/**
 * Trust Dossier agent: every Saturday it re-reads each vendor's OWN sub-processor page,
 * extracts the list with the workspace's BYOK model (or the server env model) and saves
 * it when it changed. Same shape as the AI Radar agent (lib/server/radar/agent.ts).
 */
const RUN_LOCK_MS = 8 * 60 * 60 * 1000;
const CONCURRENCY = 5;
const MAX_PAGE_CHARS = 100_000;
/** Saturday, 02:00 UTC. The scheduler polls hourly; the run is gated to this slot. */
const RUN_DAY_UTC = 6;
const RUN_HOUR_UTC = 2;

export const NO_KEY_MESSAGE =
  "Trust Dossier agent is currently unavailable. Add your AI provider API key under Admin Center → BYOK to run it.";

export class TrustDossierNoKeyError extends Error {
  constructor(public details: string[] = []) {
    super(NO_KEY_MESSAGE);
  }
}
export class TrustDossierBusyError extends Error {
  constructor() {
    super("A Trust Dossier run is already in progress");
  }
}

type Health = {
  unchanged: number;
  noSource: string[];
  errors: { vendor: string; error: string }[];
  rejected: { vendor: string; reason: string }[];
  modelSetup: string[];
};
const cap = <T>(a: T[], x: T) => void (a.length < 50 && a.push(x));

/** Due on Saturdays from 02:00 UTC when no sweep (other than a failed one) started in the last 5 days. */
export async function isTrustDossierDue(now = new Date()): Promise<boolean> {
  if (now.getUTCDay() !== RUN_DAY_UTC || now.getUTCHours() < RUN_HOUR_UTC) return false;
  const since = new Date(now.getTime() - 5 * 86_400_000).toISOString();
  const [recent] = await db
    .select({ id: trustDossierRuns.id })
    .from(trustDossierRuns)
    .where(and(gt(trustDossierRuns.startedAt, since), ne(trustDossierRuns.status, "failed")))
    .limit(1);
  return !recent;
}

// ── trusted sources: the vendor's own domain only ────────────────────────
const bareHost = (url?: string) => {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
/** A URL is trusted only on a host the catalog lists for this vendor (or a subdomain of it). */
function trustedHosts(v: TrustDossierVendor) {
  const bases = [...v.websites.map((w) => w.url), v.privacyPolicyUrl, v.subprocessorsUrl]
    .map(bareHost)
    .filter((h): h is string => !!h);
  return (url: string) => {
    const h = bareHost(url);
    return !!h && bases.some((b) => h === b || h.endsWith(`.${b}`));
  };
}

const SUBPROC_LINK_RE = /sub-?processors?|sub-?contractors?|third[- ]party (processors|vendors|service providers)|data processors?/i;

const COMMON_PATHS = ["/subprocessors", "/sub-processors", "/legal/subprocessors", "/legal/sub-processors", "/trust/subprocessors", "/legal/subprocessor-list"];

async function candidateUrls(v: TrustDossierVendor, stored: string | undefined, trusted: (u: string) => boolean) {
  const urls = [stored, v.subprocessorsUrl].filter((u): u is string => !!u && trusted(u));
  if (urls.length) return [...new Set(urls)];
  // No known list page: look for a sub-processor link on the vendor's own site / policy.
  const found: string[] = [];
  const starts = [v.privacyPolicyUrl, ...v.websites.map((w) => w.url)].filter((u): u is string => !!u).slice(0, 3);
  for (const start of starts) {
    try {
      const page = await fetchSource(start);
      for (const l of page.links)
        if ((SUBPROC_LINK_RE.test(l.text) || SUBPROC_LINK_RE.test(l.href)) && trusted(l.href)) found.push(l.href);
    } catch {
      // unreachable start page: try the next
    }
    if (found.length) break;
  }
  // Search the vendor's own domain (only when a search key is configured).
  const host = bareHost(v.websites[0]?.url);
  if (!found.length && host && searchEnabled()) {
    try {
      for (const u of await searchUrls(`${v.name} subprocessors site:${host}`)) if (trusted(u)) found.push(u);
    } catch {
      // search unavailable or rate limited: fall through to common paths
    }
  }
  // Last resort: the conventional paths on the vendor's own domain.
  if (!found.length && host) for (const p of COMMON_PATHS) found.push(`https://${host}${p}`, `https://www.${host}${p}`);
  return [...new Set(found)].slice(0, 6);
}

// ── extraction (model) + verification (code) ─────────────────────────────
const SYSTEM = `You extract a company's sub-processor list from the text of its own official page.
Rules:
- List only entities the text explicitly names as sub-processors / subprocessors / sub-contractors / third-party processors. Never add names from memory.
- "purpose" and "location" come from the text; use "Not stated" when the text does not give them.
- "last_updated": the date the page says the list was last updated or became effective, as YYYY-MM-DD; otherwise null.
- If the page is not a sub-processor list, return {"found": false}.
Return ONLY JSON: {"found": true, "subprocessors": [{"name": "...", "purpose": "...", "location": "..."}], "last_updated": "YYYY-MM-DD or null"}`;

const extractSchema = z.object({
  found: z.boolean(),
  subprocessors: z
    .array(z.object({ name: z.string(), purpose: z.string().nullish(), location: z.string().nullish() }))
    .default([]),
  last_updated: z.string().nullish(),
});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const validDate = (s?: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) || t > Date.now() + 86_400_000 ? null : s;
};

type Sub = { name: string; purpose: string; location: string };
const key = (s: Sub[]) => s.map((x) => norm(x.name)).sort().join("|");

async function extractSubprocessors(model: RadarModel, vendorName: string, text: string) {
  const raw = await radarChat(model, SYSTEM, `Vendor: ${vendorName}\n\nPage text:\n${text.slice(0, MAX_PAGE_CHARS)}`);
  const parsed = extractSchema.safeParse(typeof raw === "string" ? parseModelJson(raw) : raw);
  if (!parsed.success || !parsed.data.found) return null;
  const haystack = norm(text);
  const seen = new Set<string>();
  const subs: Sub[] = [];
  let dropped = 0;
  for (const s of parsed.data.subprocessors) {
    const name = s.name.replace(/\s+/g, " ").trim().slice(0, 120);
    // Verification gate: a name the page does not contain is a hallucination.
    if (!name || !haystack.includes(norm(name))) {
      dropped++;
      continue;
    }
    if (seen.has(norm(name))) continue;
    seen.add(norm(name));
    subs.push({ name, purpose: s.purpose?.trim().slice(0, 300) || "Not stated", location: s.location?.trim().slice(0, 120) || "Not stated" });
  }
  if (!subs.length || dropped > subs.length * 0.3) return { subs: [], reason: "Names not found verbatim in the source" };
  return { subs, stated: validDate(parsed.data.last_updated) };
}

async function processVendor(
  v: TrustDossierVendor,
  model: RadarModel,
  stored: typeof trustDossierSubprocessors.$inferSelect | undefined,
  health: Health,
): Promise<"updated" | "checked"> {
  const trusted = trustedHosts(v);
  const urls = await candidateUrls(v, stored?.sourceUrl, trusted);
  if (!urls.length) {
    cap(health.noSource, v.slug);
    return "checked";
  }
  const current: Sub[] = (stored?.subprocessors as Sub[] | undefined) ?? v.subprocessors;
  let lastError = "";
  for (const url of urls) {
    let page;
    try {
      page = await fetchSource(url);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (page.text.length < 200) continue;
    const hash = sha256(page.text);
    const now = new Date().toISOString();
    if (stored && stored.sourceHash === hash) {
      await db
        .update(trustDossierSubprocessors)
        .set({ lastCheckedAt: now, lastError: null })
        .where(eq(trustDossierSubprocessors.vendorSlug, v.slug));
      health.unchanged++;
      return "checked";
    }
    const result = await extractSubprocessors(model, v.name, page.text);
    if (!result || !result.subs.length) {
      cap(health.rejected, { vendor: v.slug, reason: result?.subs ? (result as { reason: string }).reason : "Not a sub-processor list" });
      continue;
    }
    const { subs, stated } = result;
    const changed = key(subs) !== key(current);
    // ponytail: a list that suddenly loses half its entries is more likely a bad parse than reality.
    if (changed && current.length >= 5 && subs.length < current.length * 0.5) {
      cap(health.rejected, { vendor: v.slug, reason: `List shrank from ${current.length} to ${subs.length}; kept the old list` });
      continue;
    }
    const today = now.slice(0, 10);
    const listUpdatedOn = changed ? (stated ?? today) : (stored?.listUpdatedOn ?? stated ?? null);
    await db
      .insert(trustDossierSubprocessors)
      .values({ vendorSlug: v.slug, subprocessors: subs, sourceUrl: url, sourceHash: hash, listUpdatedOn, lastCheckedAt: now })
      .onConflictDoUpdate({
        target: trustDossierSubprocessors.vendorSlug,
        set: { subprocessors: subs, sourceUrl: url, sourceHash: hash, listUpdatedOn, lastCheckedAt: now, lastError: null },
      });
    return changed ? "updated" : "checked";
  }
  if (lastError) cap(health.errors, { vendor: v.slug, error: lastError });
  return "checked";
}

// ── run orchestration ────────────────────────────────────────────────────
type Job = { vendor: TrustDossierVendor; model: RadarModel };

/**
 * Who pays for which vendor: a workspace's own BYOK model only researches vendors that
 * workspace tracks; the server env model covers the rest. Never another workspace's key.
 */
async function planJobs(tenantId: string | undefined, setup: string[]): Promise<Job[]> {
  const bySlug = new Map(TRUST_DOSSIER_VENDORS.map((v) => [v.slug, v]));
  const checked = new Map(
    (await db.select().from(trustDossierSubprocessors)).map((r) => [r.vendorSlug, Date.parse(r.lastCheckedAt)]),
  );
  const stalest = (a: TrustDossierVendor, b: TrustDossierVendor) => (checked.get(a.slug) ?? 0) - (checked.get(b.slug) ?? 0);
  const jobs: Job[] = [];
  const assigned = new Set<string>();
  const assign = (slugs: string[], model: RadarModel) => {
    for (const v of slugs.map((s) => bySlug.get(s)).filter((v): v is TrustDossierVendor => !!v).sort(stalest))
      if (!assigned.has(v.slug)) {
        assigned.add(v.slug);
        jobs.push({ vendor: v, model });
      }
  };

  const tracked = await db.select().from(trustDossierTracked).where(isNull(trustDossierTracked.removedAt));
  const tenants = tenantId ? [tenantId] : [...new Set(tracked.map((t) => t.tenantId))];
  for (const t of tenants) {
    const model = await pickRadarModel(t, setup);
    if (model) assign(tracked.filter((r) => r.tenantId === t).map((r) => r.vendorSlug), model);
  }
  // Everything else (manual run: the caller's key; scheduled: the server env key).
  const rest = tenantId ? await pickRadarModel(tenantId, setup) : await pickRadarModel(undefined, setup);
  if (rest) assign(TRUST_DOSSIER_VENDORS.map((v) => v.slug), rest);
  return jobs;
}

/** Records the run (lock-checked), then works in the background. Throws TrustDossierNoKeyError without a working key. */
export async function startTrustDossierRun(opts: {
  trigger: "cron" | "manual";
  tenantId?: string;
  userId?: string;
}) {
  const lockSince = new Date(Date.now() - RUN_LOCK_MS).toISOString();
  const [busy] = await db
    .select({ id: trustDossierRuns.id })
    .from(trustDossierRuns)
    .where(and(eq(trustDossierRuns.status, "running"), gt(trustDossierRuns.startedAt, lockSince)))
    .limit(1);
  if (busy) throw new TrustDossierBusyError();

  const setup: string[] = [];
  const jobs = await planJobs(opts.tenantId, setup);
  if (!jobs.length) throw new TrustDossierNoKeyError(setup);

  const models = [...new Set(jobs.map((j) => `${j.model.provider}/${j.model.modelId}`))];
  const [run] = await db
    .insert(trustDossierRuns)
    .values({ trigger: opts.trigger, model: models.join(", "), triggeredBy: opts.userId ?? null })
    .returning({ id: trustDossierRuns.id });

  // Fire and forget: a sweep outlives any HTTP request. Progress lands on the run row.
  void executeRun(run.id, jobs, setup).catch((error) =>
    db
      .update(trustDossierRuns)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        health: { fatal: error instanceof Error ? error.message : String(error) },
      })
      .where(eq(trustDossierRuns.id, run.id)),
  );
  return { runId: run.id };
}

async function executeRun(runId: string, jobs: Job[], modelSetup: string[]) {
  const stored = new Map((await db.select().from(trustDossierSubprocessors)).map((r) => [r.vendorSlug, r]));
  const health: Health = { unchanged: 0, noSource: [], errors: [], rejected: [], modelSetup };
  let checked = 0;
  let updated = 0;
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let j; (j = queue.shift()); ) {
        checked++;
        try {
          if ((await processVendor(j.vendor, j.model, stored.get(j.vendor.slug), health)) === "updated") updated++;
        } catch (error) {
          cap(health.errors, { vendor: j.vendor.slug, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }),
  );
  await db
    .update(trustDossierRuns)
    .set({
      // Every vendor erroring = outage or a bad key, not a result.
      status: checked > 0 && health.errors.length >= checked ? "failed" : "completed",
      finishedAt: new Date().toISOString(),
      vendorsChecked: checked,
      vendorsUpdated: updated,
      health,
    })
    .where(eq(trustDossierRuns.id, runId));
}

/** Latest agent-verified lists, keyed by vendor slug. */
export async function getSubprocessorOverrides() {
  return new Map((await db.select().from(trustDossierSubprocessors)).map((r) => [r.vendorSlug, r]));
}
