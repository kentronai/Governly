/**
 * Corrects `agents.autonomy_level` rows that were written before the autonomy
 * engine began capping a classification at the level its discovered provider
 * evidence can actually support (autonomy-engine.ts).
 *
 * Rows discovery cannot reach — a failed or timed-out provider scan — keep
 * their stale level indefinitely, so re-running discovery does not fix them.
 * This recomputes the cap from the capability facts already stored on each row,
 * which needs no cloud access.
 *
 * The cap only ever lowers a level, so this cannot invent authority an agent
 * was never classified as having.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/backfill-agent-autonomy.ts [--apply]
 *
 * Defaults to a dry run; pass --apply to write.
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";
// Imported from the drizzle module directly rather than the "@db" barrel: that
// barrel re-exports src/db/tenant.ts, which pulls the Clerk server SDK (and a
// pre-existing type error) into what is just a database script.
import { agents, db } from "../drizzle";
import type { CapabilityFacts } from "@/lib/server/agents/capability-engine";
import { maxEvidenceBackedLevel } from "@/lib/server/agents/autonomy-engine";

config({ path: ".env.local", quiet: true });
config({ path: "../.env", quiet: true });

const LEVEL_RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      autonomyLevel: agents.autonomyLevel,
      autonomyReason: agents.autonomyReason,
      capabilities: agents.capabilities,
      discoverySource: agents.discoverySource,
    })
    .from(agents);

  const corrections: Array<{
    id: string;
    name: string;
    from: string;
    to: string;
    reason: string;
  }> = [];

  for (const row of rows) {
    if (!row.autonomyLevel) continue;
    const facts = (row.capabilities ?? {}) as unknown as CapabilityFacts;
    const cap = maxEvidenceBackedLevel(facts);
    if (LEVEL_RANK[row.autonomyLevel] <= LEVEL_RANK[cap]) continue;

    corrections.push({
      id: row.id,
      name: row.name,
      from: row.autonomyLevel,
      to: cap,
      reason:
        `Corrected ${row.autonomyLevel} to ${cap} by backfill: no discovered ` +
        `provider evidence supports ${row.autonomyLevel}. Previous reason: ` +
        `${row.autonomyReason ?? "none recorded"}`,
    });
  }

  if (corrections.length === 0) {
    console.log(
      `Checked ${rows.length} agents; every stored autonomy level is already ` +
        `supported by its capability evidence. Nothing to correct.`,
    );
    return;
  }

  console.log(
    `${apply ? "Correcting" : "Would correct"} ${corrections.length} of ${rows.length} agents:`,
  );
  for (const c of corrections) {
    console.log(`  ${c.name}: ${c.from} -> ${c.to}`);
  }

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write these changes.");
    return;
  }

  for (const c of corrections) {
    await db
      .update(agents)
      .set({
        autonomyLevel: c.to as "L1" | "L2" | "L3" | "L4",
        autonomyReason: c.reason,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, c.id));
  }

  console.log(`\nCorrected ${corrections.length} agents.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
