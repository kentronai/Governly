// Runs once when the Next.js server starts. On platforms without a one-off migrate step
// (Render, Railway) set RUN_MIGRATIONS=true and the server applies pending Drizzle migrations
// before serving. Same `drizzle.__drizzle_migrations` journal as `drizzle-kit migrate`, so the
// Docker Compose `migrate` service and this never re-apply each other's work.
//
// Migrations are applied one at a time, committing after each (same as scripts/migrate-staged.mjs):
// applying all of them in one transaction fails on a fresh database because Postgres refuses to
// use an enum value (e.g. provider 'gemini') before the migration that added it has committed.
export async function register() {
  // Imported only on the Node runtime so the edge bundle never sees node:fs / node:path.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.RUN_MIGRATIONS === "true") {
    await (await import("./instrumentation-node")).runMigrations();
  }
}
