/**
 * Links an EC2 instance to a GitHub repo when the instance's name says nothing:
 * the repo's live site (GitHub homepage) resolves, by DNS, to the instance's
 * public IP. The instance and the repo need not share a name or a tag.
 */

import { resolve4 } from "node:dns/promises";

/** First https URL in a profile's `deployedOn` ("Render · https://x.io", or just the URL). */
export const siteUrl = (deployedOn: string | null | undefined) =>
  deployedOn?.match(/https:\/\/[a-z0-9.-]+[^\s·]*/i)?.[0] ?? null;

type Resolver = (hostname: string) => Promise<string[]>;

/** public IP -> "owner/repo", for every repo whose live site resolves to one. */
export async function mapRepoIps(
  repos: Array<{ repository: string | null; deployedOn: string | null }>,
  resolve: Resolver = resolve4,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    repos.map(async ({ repository, deployedOn }) => {
      const url = siteUrl(deployedOn);
      if (!repository || !url) return;
      try {
        for (const ip of await resolve(new URL(url).hostname)) out.set(ip, repository);
      } catch {
        // Unresolvable host: it simply links nothing.
      }
    }),
  );
  return out;
}
