import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, machineScans, memberships, shadowAiDaily, shadowAiTools, users } from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { emailConfigured, sendEmail } from "@/lib/server/email";
import { toolsData } from "@/app/[tenant]/ai-catalog/tools";
import type { MachineScanResult } from "@/lib/shadow-ai";

/** The AI tools (apps, websites, extensions, CLIs) one scan found, keyed the way shadow_ai_tools is. */
export function toolsInScan(result: MachineScanResult) {
  const tools = new Map<string, string>();
  for (const a of result.applications) if (a.status === "installed") tools.set(a.name, a.category);
  for (const t of result.cli_tools) if (t.installed && !tools.has(t.name)) tools.set(t.name, "CLI");
  return tools;
}

// Detected tool -> AI Catalog vendor, whose trust score drives the default risk.
const VENDOR: [RegExp, string][] = [
  [/chatgpt|openai|codex|sora/i, "OpenAI"],
  [/claude|anthropic/i, "Anthropic"],
  [/github copilot/i, "GitHub Copilot"],
  [/perplexity/i, "Perplexity"],
  [/midjourney/i, "Midjourney"],
  [/jasper/i, "Jasper AI"],
  [/grammarly/i, "Grammarly"],
];
// Without a catalog vendor: on-device tools keep data local, unknown websites/extensions are riskiest.
const CATEGORY_RISK: Record<string, number> = {
  "Local AI": 25, IDE: 40, CLI: 50, Desktop: 50, "IDE extension": 55, Extension: 55,
  "AI website": 65, "Browser extension": 70,
};

/** 0 (safe) - 100 (risky) and why, before any admin override. */
export function defaultRisk(name: string, category: string): { score: number; basis: string } {
  const vendor = VENDOR.find(([re]) => re.test(name))?.[1];
  const entry = vendor && (toolsData as any[]).find((t) => t.tool_name === vendor);
  const trust = Number(entry?.trust_security_privacy_pages?.trust_score?.overall_score?.score);
  if (Number.isFinite(trust)) return { score: 100 - trust, basis: `AI Catalog trust score ${trust} (${vendor})` };
  return { score: CATEGORY_RISK[category] ?? 60, basis: `Default for ${category}` };
}

export const HIGH_RISK = 60;

/**
 * Called after every scan/import: registers tools seen for the first time (audit + alert),
 * bumps last_seen, and refreshes today's trend counts.
 */
export async function syncShadowAiTools(tenantId: string, actorUserId: string, seen: Map<string, string>) {
  if (seen.size) {
    const names = [...seen.keys()];
    const known = new Set(
      (
        await db
          .select({ name: shadowAiTools.name })
          .from(shadowAiTools)
          .where(and(eq(shadowAiTools.tenantId, tenantId), inArray(shadowAiTools.name, names)))
      ).map((r) => r.name),
    );
    const now = new Date().toISOString();
    await db
      .insert(shadowAiTools)
      .values(names.map((name) => ({ tenantId, name, category: seen.get(name)!, lastSeenAt: now })))
      .onConflictDoUpdate({
        target: [shadowAiTools.tenantId, shadowAiTools.name],
        set: { lastSeenAt: now },
      });
    const fresh = names.filter((n) => !known.has(n));
    for (const name of fresh)
      await createAuditEvent({
        tenantId,
        actorUserId,
        action: "shadow_ai.detected",
        targetType: "shadow_ai_tool",
        targetId: name,
        metadata: { category: seen.get(name), risk: defaultRisk(name, seen.get(name)!).score },
        message: `First detected: ${name}`,
      });
    if (fresh.length) await alertNewTools(tenantId, fresh.map((n) => ({ name: n, category: seen.get(n)! })));
  }
  await recordToday(tenantId);
}

/** Machines per tool right now, stored as today's point on the trend line. */
async function recordToday(tenantId: string) {
  const rows = await db
    .select({ result: machineScans.result })
    .from(machineScans)
    .where(eq(machineScans.tenantId, tenantId));
  const counts = new Map<string, number>();
  for (const r of rows)
    for (const name of toolsInScan(r.result as MachineScanResult).keys())
      counts.set(name, (counts.get(name) ?? 0) + 1);
  const day = new Date().toISOString().slice(0, 10);
  await db.delete(shadowAiDaily).where(and(eq(shadowAiDaily.tenantId, tenantId), eq(shadowAiDaily.day, day)));
  if (counts.size)
    await db
      .insert(shadowAiDaily)
      .values([...counts].map(([name, machines]) => ({ tenantId, day, name, machines })));
}

async function adminEmails(tenantId: string) {
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        inArray(memberships.role, ["admin", "owner", "org:admin", "org:owner"]),
        isNotNull(users.email),
      ),
    );
  return [...new Set(rows.map((r) => r.email).filter((e): e is string => !!e))];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Email the tenant's admins about AI tools seen for the first time. Never throws. */
async function alertNewTools(tenantId: string, tools: { name: string; category: string }[]) {
  if (!emailConfigured()) return;
  try {
    const rated = tools.map((t) => ({ ...t, risk: defaultRisk(t.name, t.category).score }));
    const high = rated.filter((t) => t.risk >= HIGH_RISK).length;
    const subject = `Shadow AI: ${tools.length} new AI tool${tools.length > 1 ? "s" : ""} detected${high ? ` (${high} high risk)` : ""}`;
    const lines = rated.map((t) => `${t.name} (${t.category}), risk ${t.risk}${t.risk >= HIGH_RISK ? " HIGH" : ""}`);
    for (const to of await adminEmails(tenantId))
      await sendEmail({
        to,
        subject,
        text: `New AI tools were found in your organization and are labelled Unknown until reviewed:\n\n${lines.join("\n")}\n\nReview them on the Shadow AI page in Governly.`,
        html: `<p>New AI tools were found in your organization and are labelled <b>Unknown</b> until reviewed:</p><ul>${lines
          .map((l) => `<li>${esc(l)}</li>`)
          .join("")}</ul><p>Review them on the Shadow AI page in Governly.</p>`,
      });
  } catch (e) {
    console.error("Shadow AI alert failed", e);
  }
}

/** What endpoints enforce: blocked tools and the approved alternative to suggest. */
export async function blockedTools(tenantId: string) {
  return db
    .select({ name: shadowAiTools.name, category: shadowAiTools.category, alternative: shadowAiTools.alternative })
    .from(shadowAiTools)
    .where(and(eq(shadowAiTools.tenantId, tenantId), isNotNull(shadowAiTools.blockedAt)));
}

/** "ChatGPT (chatgpt.com)" -> "chatgpt.com"; null for non-website tools. */
export const websiteDomain = (name: string) => name.match(/\(([a-z0-9.-]+\.[a-z]{2,})\)$/i)?.[1] ?? null;
