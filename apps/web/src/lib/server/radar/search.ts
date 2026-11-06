import "server-only";

import { isOfficialHost } from "./text";

// Brave Search API (free tier: ~1 request/second). No key -> search is simply off.
const BRAVE_GAP_MS = 1100;
let nextAt = 0;

export const searchEnabled = () => !!process.env.BRAVE_SEARCH_API_KEY?.trim();

/** Thrown for key/quota problems so the caller can stop searching for this run. */
export class SearchUnavailableError extends Error {}

/** Official-looking result URLs for a query, best first. */
export async function searchOfficialUrls(query: string): Promise<string[]> {
  const wait = Math.max(0, nextAt - Date.now());
  nextAt = Date.now() + wait + BRAVE_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));

  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?count=15&q=${encodeURIComponent(query)}`,
    {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!.trim(),
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    },
  );
  if ([401, 402, 403, 422, 429].includes(res.status))
    throw new SearchUnavailableError(`Search API returned HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Search API returned HTTP ${res.status}`);

  const results: { url?: string }[] = (await res.json())?.web?.results ?? [];
  return results
    .map((r) => r.url ?? "")
    .filter((u) => {
      try {
        return isOfficialHost(new URL(u).hostname);
      } catch {
        return false;
      }
    });
}
