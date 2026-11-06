import { cleanSummary } from "@/lib/radar-categories";
import { htmlToText } from "./text";

/** One dated entry from an official feed or API (newest-first listings). */
export interface FeedItem {
  title: string;
  url: string;
  /** ISO YYYY-MM-DD, or null when the source does not date its entries. */
  date: string | null;
  snippet: string;
}

const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const tag = (xml: string, names: string[]) => {
  for (const n of names) {
    const m = xml.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
  }
  return "";
};

/** RSS 2.0 / Atom entries. Regex, like htmlToText: official feeds are simple and well-formed. */
function parseXmlFeed(xml: string, base: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)) {
    const e = m[2];
    const link =
      tag(e, ["link"]) ||
      e.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)?.[1] ||
      e.match(/<link[^>]*href=["']([^"']+)/i)?.[1] ||
      "";
    try {
      out.push({
        title: htmlToText(tag(e, ["title"])),
        url: new URL(link.replace(/&amp;/g, "&"), base).href,
        date: isoDate(tag(e, ["pubDate", "published", "dc:date", "updated"])),
        // Twice: feeds escape their HTML, so the first pass only decodes it.
        snippet: cleanSummary(htmlToText(htmlToText(tag(e, ["description", "summary", "content"])))).slice(0, 1500),
      });
    } catch {
      // entry without a usable link: skip
    }
  }
  return out.filter((i) => i.title);
}

type Row = Record<string, unknown>;
const str = (r: Row, keys: string[]) => {
  for (const k of keys) if (typeof r[k] === "string" && (r[k] as string).trim()) return (r[k] as string).trim();
  return "";
};

/** JSON listing APIs (Federal Register, GOV.UK search, Câmara dos Deputados, …). */
function parseJsonFeed(body: string, base: string): FeedItem[] | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const d = data as Record<string, unknown>;
  const rows = [d?.results, d?.dados, d?.items, d?.data, data].find(Array.isArray) as Row[] | undefined;
  if (!rows?.length || typeof rows[0] !== "object") return null;
  const items = rows.map((r) => {
    let url = str(r, ["html_url", "link", "url", "web_url"]);
    // Câmara: the API record -> the public bill page.
    if (!url && typeof r.id === "number" && /camara\.leg\.br/.test(base))
      url = `https://www.camara.leg.br/propostas-legislativas/${r.id}`;
    const title =
      str(r, ["title", "titulo", "name"]) ||
      [r.siglaTipo, r.numero && `${r.numero}/${r.ano}`].filter(Boolean).join(" ");
    return {
      title,
      url: url ? new URL(url, base).href : "",
      date: isoDate(str(r, ["publication_date", "public_timestamp", "published", "date", "dataApresentacao"])),
      snippet: cleanSummary(str(r, ["abstract", "description", "ementa", "summary"])).slice(0, 1500),
    };
  });
  return items.filter((i) => i.title && i.url);
}

/** Parsed entries when the body is a feed/listing API, else null (a plain page). */
export function parseFeed(body: string, contentType: string, url: string): FeedItem[] | null {
  if (/json/i.test(contentType)) return parseJsonFeed(body, url);
  if (/<(rss|feed)[\s>]/i.test(body.slice(0, 2000))) return parseXmlFeed(body, url);
  return null;
}
