import { createHash } from "node:crypto";

export const sha256 = (s: string) =>
  createHash("sha256").update(s).digest("hex");

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/** Page HTML -> plain text. Regex strip, not a parser: good enough to hash and quote. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|nbsp|quot|#39|lt|gt);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Registry URLs are admin-supplied; still refuse loopback/private/link-local hosts. */
// ponytail: hostname check only, no DNS resolution — a public name that resolves
// to a private IP gets through. Resolve + re-check if registry editing opens up.
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "::1" ||
    h === "0.0.0.0" ||
    /^(127|10)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^f[cd][0-9a-f]{2}:/.test(h)
  );
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/**
 * The verification gate: a reported change is only real if its quoted evidence
 * appears verbatim (modulo whitespace/case/curly quotes) in the fetched source.
 */
export function quoteInText(quote: string, text: string): boolean {
  const q = norm(quote);
  return q.length >= 20 && norm(text).includes(q);
}

/** Models wrap JSON in prose or code fences; take the outermost object. */
export function parseModelJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model returned no JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * JSON API responses -> readable lines (`key: value | key: value`), strings
 * unescaped, so the model can quote them verbatim and the quote check can match.
 */
export function jsonToText(raw: string): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw;
  }
  const lines: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      const scalars: string[] = [];
      const nested: unknown[] = [];
      for (const [k, x] of Object.entries(v)) {
        if (x == null || x === "") continue;
        if (typeof x === "object") nested.push(x);
        else scalars.push(`${k}: ${String(x)}`);
      }
      if (scalars.length) lines.push(scalars.join(" | "));
      return nested.forEach(walk);
    }
    if (v != null && v !== "") lines.push(String(v));
  };
  walk(data);
  return lines.join("\n");
}

/** "Is this page about AI?" across the main languages official sites use. */
export const AI_TEXT_RE =
  /artificial intelligence|\bAI\b|\bIA\b|intelligence artificielle|intelig[eê]n[cz]ia artificial|intelligenza artificiale|künstliche intelligenz|kunstmatige intelligentie|sztuczn\w+ inteligencj|artificiell intelligens|kunstig intelligens|tekoäly|umělá inteligence|mesterséges intelligencia|inteligență artificială|τεχνητή νοημοσύνη|yapay zeka|искусственн\w+ интеллект|штучн\w+ інтелект|人工知能|人工智能|인공지능|ذكاء اصطناعي|בינה מלאכותית|kecerdasan buatan|trí tuệ nhân tạo|ปัญญาประดิษฐ์/i;

/** Anchor tags of a page as absolute URLs (regex, like htmlToText: enough to list and quote). */
export function htmlLinks(html: string, base: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = htmlToText(m[2]);
    try {
      const href = new URL(m[1].replace(/&amp;/g, "&"), base).href;
      if (/^https?:/.test(href) && text) out.push({ text, href });
    } catch {
      // malformed href: skip
    }
  }
  return out;
}

/** Wording that marks a headline as a legal/policy instrument rather than news (main languages). */
export const LEGAL_RE =
  /\b(acts?|laws?|bills?|regulations?|directives?|decrees?|ordinances?|orders?|policy|policies|strateg(y|ies)|guidelines?|guidance|frameworks?|standards?|codes? of practice|proclamations?|resolutions?|legislation|rules?)\b|\b(ley(es)?|lei(s)?|loi(s)?|gesetz|legge|wet|ustawa|förordning|lag|zakon|règlement|reglamento|regulamento|verordnung|decreto|décret|direttiva|richtlijn)\b|法|法案|法律|법/i;

/**
 * Official-looking hosts only: government/legislature/regulator domains and
 * international bodies. A search hit elsewhere (news, law firms) is never a source.
 */
export function isOfficialHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    /(^|\.)(gov|gob|gouv|govt|go|gv|gc|admin|bund|overheid)\.[a-z]{2}$/.test(h) ||
    /\.gov$|\.mil$|\.int$|\.europa\.eu$|(^|\.)(oecd|unesco|coe|un|itu|iso)\.(org|int)$/.test(h) ||
    /(parliament|parlament|parlamento|parlement|senat|senado|assembl|legislat|legisl|riksdag|sejm|bundestag|bundesrat|congres|knesset|diet|duma|storting|folketing|eduskunta|tweedekamer|camara|lawmaking|gazette|egov|e-gov)/.test(h)
  );
}

/** Print/PDF renditions of another entry, or titles that only mention years well in the past. */
export function isNoiseTitle(title: string, now = new Date()): boolean {
  if (/\b(pdf|print[- ]ready|web[- ]ready|large print|accessible version)\b/i.test(title)) return true;
  const years = (title.match(/\b(?:19|20)\d{2}\b/g) ?? []).map(Number);
  return years.length > 0 && Math.max(...years) < now.getFullYear() - 2;
}
