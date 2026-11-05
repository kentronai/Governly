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
