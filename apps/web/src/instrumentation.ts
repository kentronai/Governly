// Runs once when the Next.js server starts. On platforms without a one-off migrate step
// (Render, Railway) set RUN_MIGRATIONS=true and the server applies pending Drizzle migrations
// before serving. Same `drizzle.__drizzle_migrations` journal as `drizzle-kit migrate`, so the
// Docker Compose `migrate` service and this never re-apply each other's work.
//
// Migrations are applied one at a time, committing after each (same as scripts/migrate-staged.mjs):
// applying all of them in one transaction fails on a fresh database because Postgres refuses to
// use an enum value (e.g. provider 'gemini') before the migration that added it has committed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_MIGRATIONS !== "true") return;
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;

  const src = path.resolve("./drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(src, "meta/_journal.json"), "utf8"));
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "drizzle-stage-"));
  fs.mkdirSync(path.join(stage, "meta"));
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);
  try {
    for (let i = 0; i < journal.entries.length; i++) {
      const { tag } = journal.entries[i];
      fs.copyFileSync(path.join(src, `${tag}.sql`), path.join(stage, `${tag}.sql`));
      fs.writeFileSync(
        path.join(stage, "meta/_journal.json"),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, i + 1) }),
      );
      try {
        await migrate(db, { migrationsFolder: stage });
      } catch (err) {
        console.error(`[migrate] failed at ${tag}`);
        throw err;
      }
    }
    console.log("[migrate] database is up to date");
  } finally {
    await sql.end();
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
