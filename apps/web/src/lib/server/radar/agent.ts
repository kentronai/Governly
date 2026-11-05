import "server-only";

import { and, desc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  globalAiPolicies,
  radarCoverage,
  radarRuns,
  radarSourceSnapshots,
  radarUpdates,
} from "@db";
import { radarChat, resolveRadarModel, type RadarModel } from "./llm";
import { RADAR_SYSTEM_PROMPT } from "./prompt";
import { htmlToText, isPrivateHost, quoteInText, sha256 } from "./text";

const MAX_CHARS_PER_SOURCE = 30_000;
const CONCURRENCY = 4;
const RUN_LOCK_MS = 3 * 60 * 60 * 1000;
export const RADAR_INTERVAL_HOURS = Number(process.env.RADAR_INTERVAL_HOURS) || 72;

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
  source_quote: z.string(),
});

type Health = {
  baselined: number;
  noPrimarySources: string[];
  sourceErrors: { jurisdiction: string; url: string; error: string }[];
  modelErrors: { jurisdiction: string; error: string }[];
  rejected: { jurisdiction: string; title: string; reason: string }[];
};
const cap = <T>(a: T[], x: T) => void (a.length < 50 && a.push(x));

// ── source fetching ──────────────────────────────────────────────────────
async function fetchSourceText(url: string): Promise<string> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) sources are supported");
  if (isPrivateHost(u.hostname)) throw new Error("Private/loopback hosts are not allowed");
  const res = await fetch(u, {
    headers: {
      "User-Agent": "NORIX-AI-Radar/1.0 (regulatory monitoring)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  // ponytail: HTML/text only. PDF sources are reported as errors (visible in
  // the health report) until a PDF text extractor is added.
  if (!/text\/|xml/i.test(type)) throw new Error(`Unsupported content type "${type || "unknown"}"`);
  return htmlToText(await res.text());
}

// ── run orchestration ────────────────────────────────────────────────────
export async function isRadarDue(): Promise<boolean> {
  const since = new Date(Date.now() - RADAR_INTERVAL_HOURS * 3_600_000).toISOString();
  const [recent] = await db
    .select({ id: radarRuns.id })
    .from(radarRuns)
    .where(gt(radarRuns.startedAt, since))
    .limit(1);
  return !recent;
}

/** Validates model + lock, records the run, then works in the background. */
export async function startRadarRun(opts: {
  trigger: "cron" | "manual";
  tenantId?: string;
  userId?: string;
}) {
  const model = await resolveRadarModel(opts.tenantId);
  const lockSince = new Date(Date.now() - RUN_LOCK_MS).toISOString();
  const [busy] = await db
    .select({ id: radarRuns.id })
    .from(radarRuns)
    .where(and(eq(radarRuns.status, "running"), gt(radarRuns.startedAt, lockSince)))
    .limit(1);
  if (busy) throw new RadarBusyError();

  const [run] = await db
    .insert(radarRuns)
    .values({
      trigger: opts.trigger,
      model: `${model.provider}/${model.modelId}`,
      triggeredBy: opts.userId ?? null,
    })
    .returning({ id: radarRuns.id });

  // Fire and forget: a full sweep outlives any HTTP request. Progress and the
  // outcome land on the radar_runs row.
  void executeRun(run.id, model).catch((error) =>
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

async function executeRun(runId: string, model: RadarModel) {
  // Tier 1 first, so a partial run still covers what matters most.
  const coverage = await db
    .select()
    .from(radarCoverage)
    .where(eq(radarCoverage.isEnabled, true))
    .orderBy(radarCoverage.tier, radarCoverage.jurisdictionName);

  const stats = { checked: 0, changed: 0, applied: 0, rejected: 0 };
  const health: Health = {
    baselined: 0,
    noPrimarySources: [],
    sourceErrors: [],
    modelErrors: [],
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

  await db
    .update(radarRuns)
    .set({
      status: "completed",
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

async function checkJurisdiction(
  runId: string,
  model: RadarModel,
  c: Coverage,
  stats: { checked: number; changed: number; applied: number; rejected: number },
  health: Health,
) {
  if (c.primarySourceUrls.length === 0) {
    cap(health.noPrimarySources, c.jurisdictionName);
    return;
  }
  const now = () => new Date().toISOString();
  const snaps = new Map(
    (
      await db
        .select()
        .from(radarSourceSnapshots)
        .where(eq(radarSourceSnapshots.coverageId, c.id))
    ).map((s) => [s.url, s]),
  );

  const changed: { url: string; text: string; hash: string }[] = [];
  let fetchedAny = false;
  for (const url of c.primarySourceUrls) {
    stats.checked++;
    const key = { coverageId: c.id, url };
    try {
      const pageText = await fetchSourceText(url);
      const hash = sha256(pageText);
      fetchedAny = true;
      const prev = snaps.get(url);
      const base = { ...key, lastFetchedAt: now(), lastStatus: "ok", lastError: null };
      if (!prev?.contentHash) {
        // First sighting: record a baseline, never report it as a "change".
        health.baselined++;
        await db
          .insert(radarSourceSnapshots)
          .values({ ...base, contentHash: hash })
          .onConflictDoUpdate({
            target: [radarSourceSnapshots.coverageId, radarSourceSnapshots.url],
            set: { ...base, contentHash: hash },
          });
      } else if (prev.contentHash === hash) {
        await db
          .update(radarSourceSnapshots)
          .set(base)
          .where(and(eq(radarSourceSnapshots.coverageId, c.id), eq(radarSourceSnapshots.url, url)));
      } else {
        stats.changed++;
        changed.push({ url, text: pageText, hash });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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

  if (changed.length) {
    await analyzeChanges(runId, model, c, changed, stats, health);
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
  model: RadarModel,
  c: Coverage,
  changed: { url: string; text: string; hash: string }[],
  stats: { applied: number; rejected: number },
  health: Health,
) {
  const known = await db
    .select()
    .from(globalAiPolicies)
    .where(or(eq(globalAiPolicies.country, c.jurisdictionName), eq(globalAiPolicies.state, c.jurisdictionName)))
    .orderBy(desc(globalAiPolicies.effectiveDate))
    .limit(150);
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
    "Primary sources (current text):",
    ...changed.map((s) => `=== SOURCE: ${s.url} ===\n${s.text.slice(0, MAX_CHARS_PER_SOURCE)}`),
  ].join("\n\n");

  let raw: unknown;
  try {
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
            country: c.jurisdictionName,
            region: known[0]?.region ?? null,
            sources: u.source_url,
            lastUpdated: today,
          })
          .returning({ id: globalAiPolicies.id });
        policyId = row.id;
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
        sourceUrl: u.source_url,
        sourceQuote: u.source_quote,
      });
    });
    stats.applied++;
  }

  // Analysis succeeded: accept the new page versions as the baseline.
  for (const s of changed) {
    await db
      .update(radarSourceSnapshots)
      .set({
        contentHash: s.hash,
        lastFetchedAt: new Date().toISOString(),
        lastChangedAt: new Date().toISOString(),
        lastStatus: "ok",
        lastError: null,
      })
      .where(and(eq(radarSourceSnapshots.coverageId, c.id), eq(radarSourceSnapshots.url, s.url)));
  }
}
