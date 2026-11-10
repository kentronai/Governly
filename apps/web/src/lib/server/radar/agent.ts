import "server-only";

import { generateText, Output, stepCountIs, tool } from "ai";
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  globalAiPolicies,
  radarCoverage,
  radarRuns,
  radarSourceSnapshots,
  radarUpdates,
} from "@db";
import {
  pickRadarModel,
  radarChat,
  radarLanguageModel,
  radarTemperature,
  type RadarModel,
} from "./llm";
import { parseFeed, type FeedItem } from "./feeds";
import { SearchUnavailableError, searchEnabled, searchOfficialUrls } from "./search";
import {
  INSTRUMENT_TYPES,
  POLICY_CATEGORIES,
  POLICY_STATUSES,
  guessCategory,
} from "@/lib/radar-categories";
import {
  RADAR_CLASSIFY_PROMPT,
  RADAR_DISCOVER_PROMPT,
  RADAR_FEED_PROMPT,
  RADAR_SYSTEM_PROMPT,
} from "./prompt";
import {
  AI_TEXT_RE,
  LEGAL_RE,
  htmlLinks,
  htmlToText,
  isNoiseTitle,
  isOfficialHost,
  isPrivateHost,
  jsonToText,
  quoteInText,
  sha256,
} from "./text";

const MAX_CHARS_PER_SOURCE = 30_000;
const CONCURRENCY = 4;
const RUN_LOCK_MS = 3 * 60 * 60 * 1000;
const DISCOVERY_RETRY_DAYS = 14;
const DISCOVERY_PER_RUN = 150;
const HOST_GAP_MS = 500;
export const RADAR_INTERVAL_HOURS = Number(process.env.RADAR_INTERVAL_HOURS) || 72;

/** AI Radar is on unless the server sets RADAR_ENABLED=false (the model is optional, so it needs no other setup). */
export const radarEnabled = () => process.env.RADAR_ENABLED?.trim().toLowerCase() !== "false";

export class RadarUnavailableError extends Error {
  constructor() {
    super("AI Radar is currently unavailable. Please try again later.");
  }
}

export class RadarBusyError extends Error {
  constructor() {
    super("An AI Radar run is already in progress");
  }
}

// ── model output contract ────────────────────────────────────────────────
const text = z.string().trim().min(1).max(5000).nullish();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();
// Unknown keys are stripped: this is the whitelist of columns the agent may write.
const fieldsSchema = z.object({
  policyName: z.string().trim().min(3).max(300).nullish(),
  shortName: text,
  category: z.enum(POLICY_CATEGORIES).nullish().catch(undefined),
  status: text,
  effectiveDate: iso,
  legalStatus: text,
  timeline: text,
  summary: text,
  whoIsAffected: text,
  impact: text,
  complianceRequirements: text,
  enforcementDetails: text,
});
const updateSchema = z.object({
  policy_id: z.string().uuid().nullish(),
  change_type: z.enum([
    "new_instrument",
    "status_change",
    "effective_date_change",
    "amendment",
    "enforcement_action",
    "repeal",
    "guidance",
  ]),
  title: z.string().trim().min(3).max(300),
  summary: z.string().trim().min(3).max(2000),
  fields: fieldsSchema,
  source_url: z.string(),
  reference_url: z.string().nullish(),
  source_quote: z.string(),
});

type Health = {
  baselined: number;
  discovered: number;
  modelCalls: number;
  noPrimarySources: string[];
  searchError?: string;
  sourceErrors: { jurisdiction: string; url: string; error: string }[];
  modelErrors: { jurisdiction: string; error: string }[];
  /** Why the saved BYOK / env models could not be used (empty when none was configured). */
  modelSetup: string[];
  rejected: { jurisdiction: string; title: string; reason: string }[];
};
type Stats = {
  checked: number;
  failed: number;
  changed: number;
  applied: number;
  rejected: number;
  discoveryBudget: number;
  searchOff: boolean;
};
type Link = { text: string; href: string };
type Page = { url: string; text: string; links: Link[]; items?: FeedItem[] | null };
type Changed = Page & { hash: string; keys: string[]; fresh: Link[] };
// A link is "seen" by what it says and where it points.
const linkKey = (l: Link) => `${l.href}|${l.text.toLowerCase()}`.slice(0, 500);
const MAX_SEEN_KEYS = 3000;
const cap = <T>(a: T[], x: T) => void (a.length < 50 && a.push(x));

// ── source fetching ──────────────────────────────────────────────────────
// We identify ourselves honestly and never work around a site that refuses us:
// a 403/blocked source is reported in the health report, not bypassed.
const CRAWLER_UA = "NORIX-AI-Radar/1.0 (regulatory monitoring; +https://aigov.kentron.ai)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Politeness: at most one request per host every HOST_GAP_MS (agencies publish
// many jurisdictions' sources behind one host, e.g. open-data portals).
const nextSlot = new Map<string, number>();
async function throttle(host: string) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, at + HOST_GAP_MS);
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function fetchSource(url: string): Promise<Page> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) sources are supported");
  if (isPrivateHost(u.hostname)) throw new Error("Private/loopback hosts are not allowed");
  await throttle(u.hostname);
  const get = (ua: string) =>
    fetch(u, {
      headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.5" },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  // Government sites often blip (503s, slow responses, dropped connections) or 403 non-browser
  // UAs from cloud IPs. ponytail: one retry after a pause, as a browser; a source is only
  // reported unreachable if it fails twice.
  let res = await get(CRAWLER_UA).catch(() => null);
  if (!res || res.status === 403 || res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 5_000));
    res = await get(BROWSER_UA);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  // ponytail: HTML/text/JSON only. PDF sources are reported as errors (visible in
  // the health report) until a PDF text extractor is added.
  if (!/text\/|xml|json/i.test(type)) throw new Error(`Unsupported content type "${type || "unknown"}"`);
  const body = await res.text();
  // Dated official feeds / listing APIs take the live path (see processFeed).
  const items = parseFeed(body, type, url);
  if (items) return { url, text: items.map((i) => `${i.title} ${i.snippet}`).join("\n"), links: [], items };
  if (/json/i.test(type)) {
    // One "link" per record line, pointing at the record's own URL when it has one.
    const text = jsonToText(body);
    const links = text
      .split("\n")
      .filter((l) => AI_TEXT_RE.test(l))
      .map((l) => ({
        text: l.match(/title:\s*([^|]+)/)?.[1].trim() || l.slice(0, 200),
        href: l.match(/https?:\/\/[^\s|]+/)?.[0] ?? url,
      }));
    return { url, text, links };
  }
  return { url, text: htmlToText(body), links: htmlLinks(body, url) };
}

// ── run orchestration ────────────────────────────────────────────────────
export async function isRadarDue(): Promise<boolean> {
  const since = new Date(Date.now() - RADAR_INTERVAL_HOURS * 3_600_000).toISOString();
  const [recent] = await db
    .select({ id: radarRuns.id })
    .from(radarRuns)
    // A failed sweep (e.g. bad model key) must not block the retry for 3 days.
    .where(and(gt(radarRuns.startedAt, since), ne(radarRuns.status, "failed")))
    .limit(1);
  return !recent;
}

/** Records the run (lock-checked), then works in the background. A model is optional. Throws RadarUnavailableError while switched off. */
export async function startRadarRun(opts: {
  trigger: "cron" | "manual";
  tenantId?: string;
  userId?: string;
}) {
  if (!radarEnabled()) throw new RadarUnavailableError();
  const lockSince = new Date(Date.now() - RUN_LOCK_MS).toISOString();
  const [busy] = await db
    .select({ id: radarRuns.id })
    .from(radarRuns)
    .where(and(eq(radarRuns.status, "running"), gt(radarRuns.startedAt, lockSince)))
    .limit(1);
  if (busy) throw new RadarBusyError();

  const modelSetup: string[] = [];
  const model = await pickRadarModel(opts.tenantId, modelSetup);
  const [run] = await db
    .insert(radarRuns)
    .values({
      trigger: opts.trigger,
      model: model ? `${model.provider}/${model.modelId}` : null,
      triggeredBy: opts.userId ?? null,
    })
    .returning({ id: radarRuns.id });

  // Fire and forget: a full sweep outlives any HTTP request. Progress and the
  // outcome land on the radar_runs row.
  void executeRun(run.id, model, modelSetup).catch((error) =>
    db
      .update(radarRuns)
      .set({
        status: "failed",
        finishedAt: new Date().toISOString(),
        health: { fatal: error instanceof Error ? error.message : String(error) },
      })
      .where(eq(radarRuns.id, run.id)),
  );
  return { runId: run.id };
}

async function executeRun(runId: string, model: RadarModel | null, modelSetup: string[]) {
  // Tier 1 first, so a partial run still covers what matters most.
  const coverage = await db
    .select()
    .from(radarCoverage)
    .where(eq(radarCoverage.isEnabled, true))
    .orderBy(radarCoverage.tier, radarCoverage.jurisdictionName);

  const stats: Stats = {
    checked: 0,
    failed: 0,
    changed: 0,
    applied: 0,
    rejected: 0,
    discoveryBudget: DISCOVERY_PER_RUN,
    searchOff: false,
  };
  const health: Health = {
    baselined: 0,
    discovered: 0,
    modelCalls: 0,
    noPrimarySources: [],
    sourceErrors: [],
    modelErrors: [],
    modelSetup,
    rejected: [],
  };

  const queue = [...coverage];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let c; (c = queue.shift()); ) {
        try {
          await checkJurisdiction(runId, model, c, stats, health);
        } catch (error) {
          cap(health.modelErrors, {
            jurisdiction: c.jurisdictionName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }),
  );

  await classifyUncategorized(model, health);

  // Nothing reachable at all (outage, blocked egress) or every model call failing is a failed run.
  const unavailable =
    (stats.checked > 0 && stats.failed >= stats.checked) ||
    (health.modelCalls > 0 && health.modelErrors.length >= health.modelCalls);

  await db
    .update(radarRuns)
    .set({
      status: unavailable ? "failed" : "completed",
      finishedAt: new Date().toISOString(),
      sourcesChecked: stats.checked,
      sourcesChanged: stats.changed,
      updatesApplied: stats.applied,
      updatesRejected: stats.rejected,
      health,
    })
    .where(eq(radarRuns.id, runId));
}

type Coverage = typeof radarCoverage.$inferSelect;

/** Keeps URLs that load, hold real text and are about AI (at most 3, in the given order). */
async function adoptReachable(urls: string[]): Promise<string[]> {
  const adopted: string[] = [];
  for (const url of [...new Set(urls)].slice(0, 8)) {
    if (adopted.length >= 3) break;
    try {
      const page = await fetchSource(url);
      if (page.text.length >= 800 && AI_TEXT_RE.test(page.text)) adopted.push(url);
    } catch {
      // unreachable / blocked / not text: simply not adopted
    }
  }
  return adopted;
}

/**
 * Finds official sources for a jurisdiction that has none. Brave Search (no model
 * needed) proposes official-domain pages; when a model is available it also gets a
 * turn. Every URL is fetch-verified, and updates still need a verbatim quote from
 * the fetched page, so a wrong guess can never produce a false policy.
 */
async function discoverSources(
  model: RadarModel | null,
  c: Coverage,
  stats: Stats,
  health: Health,
) {
  const retryAfter = Date.now() - DISCOVERY_RETRY_DAYS * 86_400_000;
  if (c.discoveryAttemptedAt && new Date(c.discoveryAttemptedAt).getTime() > retryAfter) return;
  if (stats.discoveryBudget <= 0) return;
  const canSearch = searchEnabled() && !stats.searchOff;
  if (!canSearch && !model) return; // nothing to look with: don't stamp "attempted"
  stats.discoveryBudget--;

  const place = c.state ? `${c.state} ${c.country ?? ""}`.trim() : c.jurisdictionName;
  let adopted: string[] = [];
  let attempted = false;

  if (canSearch) {
    try {
      for (const q of [
        `${place} artificial intelligence law regulation official government`,
        `${place} parliament artificial intelligence act bill`,
      ]) {
        adopted = await adoptReachable(await searchOfficialUrls(q));
        attempted = true;
        if (adopted.length) break;
      }
    } catch (error) {
      if (error instanceof SearchUnavailableError) {
        stats.searchOff = true;
        health.searchError = error.message;
      }
    }
  }

  if (!adopted.length && model) {
    try {
      health.modelCalls++;
      const raw = await radarChat(
        model,
        RADAR_DISCOVER_PROMPT,
        `Jurisdiction: ${c.jurisdictionName}${c.country && c.country !== c.jurisdictionName ? ` (${c.country}${c.state ? `, ${c.state}` : ""})` : ""}\nInstruments of interest: ${c.instrumentsTracked || "all AI-related laws, regulations, standards and guidance"}`,
      );
      const parsed = z
        .object({ sources: z.array(z.object({ url: z.string() })).max(10) })
        .safeParse(raw);
      adopted = await adoptReachable(parsed.success ? parsed.data.sources.map((x) => x.url) : []);
      attempted = true;
    } catch (error) {
      cap(health.modelErrors, {
        jurisdiction: c.jurisdictionName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Not stamped when every route errored out (key/quota/outage): retried next run.
  if (!attempted) return;
  await db
    .update(radarCoverage)
    .set({
      discoveryAttemptedAt: new Date().toISOString(),
      ...(adopted.length ? { primarySourceUrls: adopted } : {}),
    })
    .where(eq(radarCoverage.id, c.id));
  if (adopted.length) {
    c.primarySourceUrls = adopted;
    health.discovered++;
  }
}

/** Instruments the platform already has for this jurisdiction (national entries: state IS NULL). */
async function loadKnown(c: Coverage) {
  const country = c.country ?? c.jurisdictionName;
  return db
    .select()
    .from(globalAiPolicies)
    .where(
      c.state
        ? and(eq(globalAiPolicies.country, country), eq(globalAiPolicies.state, c.state))
        : and(eq(globalAiPolicies.country, country), isNull(globalAiPolicies.state)),
    )
    .orderBy(desc(globalAiPolicies.effectiveDate))
    .limit(150);
}

async function checkJurisdiction(
  runId: string,
  model: RadarModel | null,
  c: Coverage,
  stats: Stats,
  health: Health,
) {
  if (c.primarySourceUrls.length === 0) {
    await discoverSources(model, c, stats, health);
    if (c.primarySourceUrls.length === 0) {
      cap(health.noPrimarySources, c.jurisdictionName);
      return;
    }
  }
  const now = () => new Date().toISOString();
  const known = await loadKnown(c);
  const snaps = new Map(
    (
      await db
        .select()
        .from(radarSourceSnapshots)
        .where(eq(radarSourceSnapshots.coverageId, c.id))
    ).map((s) => [s.url, s]),
  );

  const changed: Changed[] = [];
  const feeds: { url: string; items: FeedItem[]; seen: string[] }[] = [];
  let fetchedAny = false;
  for (const url of c.primarySourceUrls) {
    stats.checked++;
    const key = { coverageId: c.id, url };
    try {
      const page = await fetchSource(url);
      const pageText = page.text;
      const hash = sha256(pageText);
      fetchedAny = true;
      const prev = snaps.get(url);
      const base = { ...key, lastFetchedAt: now(), lastStatus: "ok", lastError: null };
      const keys = page.links.map(linkKey).slice(0, MAX_SEEN_KEYS);
      if (page.items) {
        // Feeds are never "baselined": the newest dated entries are reported straight away.
        feeds.push({ url, items: page.items, seen: prev?.seenKeys ?? [] });
        await db
          .insert(radarSourceSnapshots)
          .values({ ...base, contentHash: hash })
          .onConflictDoUpdate({
            target: [radarSourceSnapshots.coverageId, radarSourceSnapshots.url],
            set: { ...base, contentHash: hash },
          });
      } else if (!prev?.contentHash) {
        // First sighting: record a baseline (page hash + the links it shows), never report it as a "change".
        health.baselined++;
        await db
          .insert(radarSourceSnapshots)
          .values({ ...base, contentHash: hash, seenKeys: keys })
          .onConflictDoUpdate({
            target: [radarSourceSnapshots.coverageId, radarSourceSnapshots.url],
            set: { ...base, contentHash: hash, seenKeys: keys },
          });
      } else if (prev.contentHash === hash) {
        await db
          .update(radarSourceSnapshots)
          .set(base)
          .where(and(eq(radarSourceSnapshots.coverageId, c.id), eq(radarSourceSnapshots.url, url)));
      } else {
        stats.changed++;
        const seen = new Set(prev.seenKeys);
        changed.push({ ...page, hash, keys, fresh: page.links.filter((l) => !seen.has(linkKey(l))) });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.failed++;
      cap(health.sourceErrors, { jurisdiction: c.jurisdictionName, url, error: message });
      await db
        .insert(radarSourceSnapshots)
        .values({ ...key, lastFetchedAt: now(), lastStatus: "error", lastError: message })
        .onConflictDoUpdate({
          target: [radarSourceSnapshots.coverageId, radarSourceSnapshots.url],
          set: { lastFetchedAt: now(), lastStatus: "error", lastError: message },
        });
    }
  }

  for (const f of feeds) {
    await processFeed(runId, model, c, f, known, stats, health);
  }
  if (changed.length) {
    await analyzeChanges(runId, model, c, changed, known, stats, health);
  }
  if (fetchedAny) {
    await db
      .update(radarCoverage)
      .set({ lastVerifiedDate: now().slice(0, 10) })
      .where(eq(radarCoverage.id, c.id));
  }
}

async function analyzeChanges(
  runId: string,
  model: RadarModel | null,
  c: Coverage,
  changed: Changed[],
  known: Awaited<ReturnType<typeof loadKnown>>,
  stats: Stats,
  health: Health,
) {
  if (!model) {
    await extractWithoutModel(runId, c, changed, known, stats);
    return acceptSnapshots(c, changed);
  }
  const knownById = new Map(known.map((p) => [p.id, p]));

  const userMessage = [
    `Jurisdiction: ${c.jurisdictionName} (tier ${c.tier})`,
    `Instruments tracked: ${c.instrumentsTracked || "all AI-related instruments"}`,
    `Known instruments in the platform (JSON): ${JSON.stringify(
      known.map((p) => ({
        id: p.id,
        policyName: p.policyName,
        shortName: p.shortName,
        status: p.status,
        effectiveDate: p.effectiveDate,
        state: p.state,
      })),
    )}`,
    "Report only what is NEW or CHANGED since the last check, never the instruments the page has always listed.",
    changed.some((x) => x.fresh.length)
      ? `Links that are new on the sources since the last check:\n${changed
          .flatMap((x) => x.fresh.slice(0, 100).map((l) => `- ${l.text} (${l.href})`))
          .join("\n")}`
      : "",
    "Primary sources (current text):",
    ...changed.map((s) => `=== SOURCE: ${s.url} ===\n${s.text.slice(0, MAX_CHARS_PER_SOURCE)}`),
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: unknown;
  try {
    health.modelCalls++;
    raw = await radarChat(model, RADAR_SYSTEM_PROMPT, userMessage);
  } catch (error) {
    // Snapshot hashes stay as-is, so the next run retries this jurisdiction.
    cap(health.modelErrors, {
      jurisdiction: c.jurisdictionName,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const items = z.object({ updates: z.array(z.unknown()) }).safeParse(raw);
  const textByUrl = new Map(changed.map((s) => [s.url, s.text]));
  const today = new Date().toISOString().slice(0, 10);

  for (const item of items.success ? items.data.updates : []) {
    const parsed = updateSchema.safeParse(item);
    const title = parsed.success ? parsed.data.title : "(unparseable update)";
    const reject = (reason: string) => {
      stats.rejected++;
      cap(health.rejected, { jurisdiction: c.jurisdictionName, title, reason });
    };
    if (!parsed.success) {
      reject("Malformed model output");
      continue;
    }
    const u = parsed.data;

    // Verification gate: cited URL must be one we fetched, quote must be in it.
    const pageText = textByUrl.get(u.source_url);
    if (pageText === undefined) {
      reject("Cited a source that was not supplied");
      continue;
    }
    if (!quoteInText(u.source_quote, pageText)) {
      reject("Quote not found verbatim in the primary source");
      continue;
    }
    // Show the specific document when the model found one in the text; else the page.
    const shownUrl =
      u.reference_url &&
      /^https?:\/\//i.test(u.reference_url) &&
      pageText.includes(u.reference_url)
        ? u.reference_url
        : u.source_url;
    const fields = Object.fromEntries(
      Object.entries(u.fields).filter(([, v]) => v != null),
    ) as Record<string, string>;
    if (fields.effectiveDate && !u.source_quote.includes(fields.effectiveDate.slice(0, 4))) {
      reject("Effective date year is not supported by the quote");
      continue;
    }

    const existing = u.policy_id ? knownById.get(u.policy_id) : undefined;
    if (u.policy_id && !existing) {
      reject("References an instrument that is not in the registry");
      continue;
    }

    let diff: Record<string, { from: unknown; to: unknown }> = {};
    if (existing) {
      delete fields.category; // topic is assigned by the classifier, not by a source claim
      const current = existing as Record<string, unknown>;
      for (const [k, v] of Object.entries(fields)) {
        if (k !== "policyName" && current[k] !== v) diff[k] = { from: current[k] ?? null, to: v };
      }
      if (!Object.keys(diff).length) continue; // already up to date
    } else {
      const dup = known.some(
        (p) => p.policyName.toLowerCase() === (fields.policyName ?? "").toLowerCase(),
      );
      if (!fields.policyName || dup) {
        reject(dup ? "Instrument already exists" : "New instrument has no name");
        continue;
      }
      diff = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { from: null, to: v }]));
    }

    await db.transaction(async (tx) => {
      let policyId = existing?.id ?? null;
      if (existing) {
        const { policyName: _ignored, ...set } = fields;
        await tx
          .update(globalAiPolicies)
          .set({ ...set, lastUpdated: today })
          .where(eq(globalAiPolicies.id, existing.id));
      } else {
        const [row] = await tx
          .insert(globalAiPolicies)
          .values({
            ...fields,
            policyName: fields.policyName,
            country: c.country ?? c.jurisdictionName,
            state: c.state,
            region: c.region ?? known[0]?.region ?? null,
            sources: shownUrl,
            lastUpdated: today,
          })
          .returning();
        policyId = row.id;
        known.push(row);
        knownById.set(row.id, row);
      }
      await tx.insert(radarUpdates).values({
        runId,
        coverageId: c.id,
        jurisdiction: c.jurisdictionName,
        policyId,
        changeType: u.change_type,
        title: u.title,
        summary: u.summary,
        changes: diff,
        effectiveDate: fields.effectiveDate ?? null,
        sourceUrl: shownUrl,
        sourceQuote: u.source_quote,
      });
    });
    stats.applied++;
  }

  await acceptSnapshots(c, changed);
}

// ── live path: dated official feeds ──────────────────────────────────────
const FRESH_DAYS = Number(process.env.RADAR_FRESH_DAYS) || 60;
const FEED_ITEMS_PER_SOURCE = 15;
const AGENT_STEPS = 4;
// A feed URL that already searches for AI (Federal Register, GOV.UK, Câmara…).
const AI_QUERY_RE = /artificial|intelig|intelligen/i;

type Known = Awaited<ReturnType<typeof loadKnown>>;

// Loose on purpose: {"relevant": false} is a valid answer; the gate below enforces the rest.
const findingSchema = z.object({
  relevant: z.boolean(),
  name: z.string().nullish(),
  instrument_type: z.string().nullish(),
  change_type: z.string().nullish(),
  status: z.string().nullish(),
  category: z.string().nullish(),
  description: z.string().nullish(),
  who_is_affected: z.string().nullish(),
  compliance_requirements: z.string().nullish(),
  effective_date: z.string().nullish(),
  published_date: z.string().nullish(),
  source_url: z.string().nullish(),
  source_quote: z.string().nullish(),
});
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null =>
  list.includes(v as T) ? (v as T) : null;
const isoOrNull = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const clip = (v: unknown, n: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The live path. A feed lists the newest official documents with their dates. Every
 * fresh, AI-related entry is looked at exactly once (remembered in the snapshot's
 * seen keys), newest first, so the first run already reports the latest instruments.
 */
async function processFeed(
  runId: string,
  model: RadarModel | null,
  c: Coverage,
  feed: { url: string; items: FeedItem[]; seen: string[] },
  known: Known,
  stats: Stats,
  health: Health,
) {
  const cutoff = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set(feed.seen);
  const queryIsAi = AI_QUERY_RE.test(decodeURIComponent(feed.url));
  const fresh = feed.items
    .filter((i) => !seen.has(i.url) && (!i.date || i.date >= cutoff))
    .filter((i) => queryIsAi || AI_TEXT_RE.test(`${i.title} ${i.snippet}`))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, FEED_ITEMS_PER_SOURCE);
  if (!fresh.length) return;
  stats.changed++;

  const reported = new Set(
    (
      await db
        .select({ url: radarUpdates.sourceUrl })
        .from(radarUpdates)
        .where(inArray(radarUpdates.sourceUrl, fresh.map((i) => i.url)))
    ).map((r) => r.url),
  );

  for (const item of fresh) {
    seen.add(item.url);
    if (reported.has(item.url)) continue;
    try {
      if (model) await investigate(runId, model, c, item, known, stats, health);
      else await listWithoutModel(runId, c, item, known, stats);
    } catch (error) {
      seen.delete(item.url); // model/API failure: try this entry again next run
      cap(health.modelErrors, { jurisdiction: c.jurisdictionName, error: errorText(error) });
    }
  }

  await db
    .update(radarSourceSnapshots)
    .set({ seenKeys: [...seen].slice(-MAX_SEEN_KEYS) })
    .where(and(eq(radarSourceSnapshots.coverageId, c.id), eq(radarSourceSnapshots.url, feed.url)));
}

/**
 * One feed entry -> one verified policy record. A Vercel AI SDK agent reads the
 * official page, may open the instrument it announces (official hosts only), and
 * answers with a structured record that must quote a page it actually read.
 */
async function investigate(
  runId: string,
  model: RadarModel,
  c: Coverage,
  item: FeedItem,
  known: Known,
  stats: Stats,
  health: Health,
) {
  // Evidence the quote may come from: the feed entry itself and every page read.
  const pages = new Map<string, string>([[item.url, `${item.title}\n${item.snippet}`]]);
  let links: Link[] = [];
  try {
    const page = await fetchSource(item.url);
    if (!page.items) {
      pages.set(item.url, `${item.title}\n${item.snippet}\n${page.text}`);
      links = page.links.filter((l) => isOfficialHost(new URL(l.href).hostname)).slice(0, 40);
    }
  } catch {
    // page blocked/PDF: the agent still has the feed entry
  }
  const entryHost = new URL(item.url).hostname;

  const open_official_page = tool({
    description:
      "Read the text of an official government, legislature or regulator page (e.g. the law, bill or guidance an announcement links to).",
    inputSchema: z.object({ url: z.string().describe("Absolute https URL from the page's links") }),
    execute: async ({ url }) => {
      try {
        const host = new URL(url).hostname;
        if (host !== entryHost && !isOfficialHost(host)) return "Refused: not an official host.";
        const page = await fetchSource(url);
        pages.set(url, page.text);
        return page.text.slice(0, MAX_CHARS_PER_SOURCE);
      } catch (error) {
        return `Could not open the page: ${errorText(error)}`;
      }
    },
  });

  health.modelCalls++;
  const { output: f } = await generateText({
    model: radarLanguageModel(model),
    temperature: radarTemperature(model),
    system: RADAR_FEED_PROMPT,
    prompt: [
      `Jurisdiction: ${c.jurisdictionName}`,
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      `Feed entry: ${item.title}`,
      `Entry URL: ${item.url}`,
      `Published: ${item.date ?? "unknown"}`,
      links.length ? `Official links on the page:\n${links.map((l) => `- ${l.text} (${l.href})`).join("\n")}` : "",
      `=== PAGE TEXT (${item.url}) ===\n${pages.get(item.url)!.slice(0, MAX_CHARS_PER_SOURCE)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    tools: { open_official_page },
    stopWhen: stepCountIs(AGENT_STEPS),
    output: Output.object({ schema: findingSchema }),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(240_000),
  });
  if (!f.relevant) return;

  const name = clip(f.name, 300);
  const reject = (reason: string) => {
    stats.rejected++;
    cap(health.rejected, { jurisdiction: c.jurisdictionName, title: name ?? item.title, reason });
  };
  const description = clip(f.description, 4000);
  if (!name || !description) return reject("Missing name or description");
  // Verification gate: the quote must really be on a page the agent read.
  const sourceUrl = f.source_url && pages.has(f.source_url) ? f.source_url : item.url;
  const quote = clip(f.source_quote, 1000) ?? "";
  if (!quoteInText(quote, pages.get(sourceUrl)!)) return reject("Quote not found verbatim in the source");

  let effectiveDate = isoOrNull(f.effective_date);
  if (effectiveDate && !pages.get(sourceUrl)!.includes(effectiveDate.slice(0, 4))) effectiveDate = null;
  const fields = {
    policyName: name,
    category: oneOf(POLICY_CATEGORIES, f.category) ?? guessCategory(`${name} ${description}`),
    status: oneOf(POLICY_STATUSES, f.status),
    effectiveDate,
    summary: description,
    whoIsAffected: clip(f.who_is_affected, 3000),
    complianceRequirements: clip(f.compliance_requirements, 5000),
  };
  await saveFinding(runId, c, known, {
    fields,
    changeType: oneOf(updateSchema.shape.change_type.options, f.change_type) ?? "new_instrument",
    instrumentType: oneOf(INSTRUMENT_TYPES, f.instrument_type),
    publishedDate: isoOrNull(f.published_date) ?? item.date,
    sourceUrl,
    quote,
  });
  stats.applied++;
}

/** No model: an entry whose own title is an AI law/policy is listed with the feed's text. */
async function listWithoutModel(
  runId: string,
  c: Coverage,
  item: FeedItem,
  known: Known,
  stats: Stats,
) {
  const title = item.title.replace(/\s+/g, " ").trim();
  if (!AI_TEXT_RE.test(title) || !LEGAL_RE.test(title) || isNoiseTitle(title)) return;
  const quote = `${title} ${item.snippet}`.trim().slice(0, 400);
  if (!quoteInText(quote, `${item.title} ${item.snippet}`)) return;
  await saveFinding(runId, c, known, {
    fields: {
      policyName: title,
      category: guessCategory(`${title} ${item.snippet}`),
      summary: item.snippet || null,
    },
    changeType: "new_instrument",
    instrumentType: null,
    publishedDate: item.date,
    sourceUrl: item.url,
    quote,
  });
  stats.applied++;
}

/** Writes the policy (new, or links to the one with the same name) and the update row. */
async function saveFinding(
  runId: string,
  c: Coverage,
  known: Known,
  f: {
    fields: { policyName: string } & Partial<Record<string, string | null>>;
    changeType: string;
    instrumentType: string | null;
    publishedDate: string | null;
    sourceUrl: string;
    quote: string;
  },
) {
  const today = new Date().toISOString().slice(0, 10);
  const set = Object.fromEntries(Object.entries(f.fields).filter(([, v]) => v != null)) as Record<
    string,
    string
  >;
  const existing = known.find((p) => p.policyName.toLowerCase() === f.fields.policyName.toLowerCase());
  await db.transaction(async (tx) => {
    let policyId = existing?.id;
    if (!policyId) {
      const [row] = await tx
        .insert(globalAiPolicies)
        .values({
          ...set,
          policyName: f.fields.policyName,
          country: c.country ?? c.jurisdictionName,
          state: c.state,
          region: c.region ?? known[0]?.region ?? null,
          sources: f.sourceUrl,
          lastUpdated: today,
        })
        .returning();
      policyId = row.id;
      known.push(row);
    }
    await tx.insert(radarUpdates).values({
      runId,
      coverageId: c.id,
      jurisdiction: c.jurisdictionName,
      policyId,
      changeType: f.changeType,
      instrumentType: f.instrumentType,
      publishedDate: f.publishedDate,
      title: f.fields.policyName,
      summary: set.summary ?? f.fields.policyName,
      changes: Object.fromEntries(Object.entries(set).map(([k, v]) => [k, { from: null, to: v }])),
      effectiveDate: set.effectiveDate ?? null,
      sourceUrl: f.sourceUrl,
      sourceQuote: f.quote,
    });
  });
}

/** Analysis succeeded: accept the new page versions as the baseline. */
async function acceptSnapshots(c: Coverage, changed: { url: string; hash: string; keys: string[] }[]) {
  for (const s of changed) {
    await db
      .update(radarSourceSnapshots)
      .set({
        contentHash: s.hash,
        seenKeys: s.keys,
        lastFetchedAt: new Date().toISOString(),
        lastChangedAt: new Date().toISOString(),
        lastStatus: "ok",
        lastError: null,
      })
      .where(and(eq(radarSourceSnapshots.coverageId, c.id), eq(radarSourceSnapshots.url, s.url)));
  }
}

const HEURISTIC_PER_SOURCE = 15;

/**
 * No model available: list NEW instruments straight from the official page (links it
 * did not show at the last check). A link or record counts when its own text is about AI and reads like a law/policy title;
 * it is stored with the verbatim passage it came from, same as model updates.
 * Status/dates/impact stay empty until a model analyses the source.
 */
async function extractWithoutModel(
  runId: string,
  c: Coverage,
  changed: Changed[],
  known: Awaited<ReturnType<typeof loadKnown>>,
  stats: Stats,
) {
  const names = new Set(known.map((p) => p.policyName.toLowerCase()));
  const today = new Date().toISOString().slice(0, 10);
  for (const page of changed) {
    let taken = 0;
    for (const link of page.fresh) {
      if (taken >= HEURISTIC_PER_SOURCE) break;
      const title = link.text.replace(/\s+/g, " ").trim();
      if (title.length < 8 || title.length > 200 || isNoiseTitle(title)) continue;
      if (!AI_TEXT_RE.test(title) || !LEGAL_RE.test(title) || names.has(title.toLowerCase())) continue;
      // Verification gate: the passage must really be in the fetched page.
      const at = page.text.toLowerCase().indexOf(title.toLowerCase());
      if (at < 0) continue;
      const quote = page.text.slice(at, at + Math.max(title.length, 160)).trim();
      if (!quoteInText(quote, page.text)) continue;

      names.add(title.toLowerCase());
      taken++;
      const category = guessCategory(title);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(globalAiPolicies)
          .values({
            policyName: title,
            category,
            summary: quote,
            country: c.country ?? c.jurisdictionName,
            state: c.state,
            region: c.region ?? known[0]?.region ?? null,
            sources: link.href,
            lastUpdated: today,
          })
          .returning();
        known.push(row);
        await tx.insert(radarUpdates).values({
          runId,
          coverageId: c.id,
          jurisdiction: c.jurisdictionName,
          policyId: row.id,
          changeType: "new_instrument",
          title,
          summary: `Listed on ${new URL(link.href).hostname}.`,
          changes: { policyName: { from: null, to: title }, category: { from: null, to: category } },
          sourceUrl: link.href,
          sourceQuote: quote,
        });
      });
      stats.applied++;
    }
  }
}

const CLASSIFY_BATCH = 25;
const CLASSIFY_PER_RUN = 500;

/** Gives every policy a topic so the Category filter works (model if available, else keyword rules). Remaining ones are picked up next run. */
async function classifyUncategorized(model: RadarModel | null, health: Health) {
  const rows = await db
    .select({
      id: globalAiPolicies.id,
      policyName: globalAiPolicies.policyName,
      summary: globalAiPolicies.summary,
    })
    .from(globalAiPolicies)
    .where(isNull(globalAiPolicies.category))
    .limit(CLASSIFY_PER_RUN);

  if (!model) {
    for (const p of rows) {
      await db
        .update(globalAiPolicies)
        .set({ category: guessCategory(`${p.policyName} ${p.summary ?? ""}`) })
        .where(eq(globalAiPolicies.id, p.id));
    }
    return;
  }
  for (let i = 0; i < rows.length; i += CLASSIFY_BATCH) {
    const batch = rows.slice(i, i + CLASSIFY_BATCH);
    try {
      health.modelCalls++;
      const raw = await radarChat(
        model,
        RADAR_CLASSIFY_PROMPT,
        JSON.stringify(
          batch.map((p) => ({ id: p.id, name: p.policyName, summary: p.summary?.slice(0, 300) ?? "" })),
        ),
      );
      const parsed = z.object({ items: z.array(z.unknown()) }).safeParse(raw);
      const ids = new Set(batch.map((p) => p.id));
      for (const item of parsed.success ? parsed.data.items : []) {
        const r = z
          .object({ id: z.string(), category: z.enum(POLICY_CATEGORIES) })
          .safeParse(item);
        if (r.success && ids.has(r.data.id)) {
          await db
            .update(globalAiPolicies)
            .set({ category: r.data.category })
            .where(and(eq(globalAiPolicies.id, r.data.id), isNull(globalAiPolicies.category)));
        }
      }
    } catch (error) {
      cap(health.modelErrors, {
        jurisdiction: "(topic classification)",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
