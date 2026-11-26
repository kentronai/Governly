// Applies the Drizzle migrations one at a time, committing after each.
//
// `drizzle-kit migrate` runs every pending migration in ONE transaction. On a
// fresh database that fails, because some migrations add an enum value
// (ALTER TYPE ... ADD VALUE) and later ones use it, and Postgres refuses to
// use a new enum value before the transaction that added it has committed.
// Databases that were migrated release by release never hit this.
//
// This script uses the same migrator and the same bookkeeping table
// (drizzle.__drizzle_migrations), so afterwards `drizzle-kit migrate` sees
// everything as applied. Safe to re-run.
//
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const src = path.resolve(process.env.MIGRATIONS_DIR ?? "drizzle");
const journal = JSON.parse(fs.readFileSync(path.join(src, "meta/_journal.json"), "utf8"));
const ssl = (process.env.DB_SSL ?? "false").toLowerCase() === "true";
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: ssl ? "require" : false, onnotice() {} });
const db = drizzle(sql);

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-stage-"));
fs.mkdirSync(path.join(stage, "meta"));
try {
  for (let i = 0; i < journal.entries.length; i++) {
    const entry = journal.entries[i];
    fs.copyFileSync(path.join(src, `${entry.tag}.sql`), path.join(stage, `${entry.tag}.sql`));
    fs.writeFileSync(
      path.join(stage, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, i + 1) }),
    );
    try {
      await migrate(db, { migrationsFolder: stage });
    } catch (err) {
      console.error(`\nFailed at ${entry.tag}`);
      throw err;
    }
    console.log(`ok ${entry.tag}`);
  }
  console.log(`\nAll ${journal.entries.length} migrations applied.`);
} finally {
  await sql.end();
}
