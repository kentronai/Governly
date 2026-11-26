// Runs once when the Next.js server starts. On platforms without a one-off migrate step
// (Render, Railway) set RUN_MIGRATIONS=true and the server applies pending Drizzle migrations
// before serving. Same `drizzle.__drizzle_migrations` journal as `drizzle-kit migrate`, so the
// Docker Compose `migrate` service and this never re-apply each other's work.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_MIGRATIONS !== "true") return;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("[migrate] database is up to date");
  } finally {
    await sql.end();
  }
}
