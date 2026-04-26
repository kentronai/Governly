/**
 * Drizzle config for container/runtime environments.
 * Reads DATABASE_URL from process.env (set by docker-compose env_file).
 *
 * SSL is controlled by DB_SSL:
 *   DB_SSL=true   → SSL on (Neon, RDS with TLS, etc.)
 *   DB_SSL=false  → SSL off (local Postgres in docker-compose)
 *   unset         → defaults to false so local-by-default works
 *
 * Override on the command line with `-e DB_SSL=true` when targeting a
 * managed Postgres that requires TLS.
 */
import type { Config } from "drizzle-kit";

const dbSsl = (process.env.DB_SSL ?? "false").toLowerCase() === "true";

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: dbSsl,
  },
} satisfies Config;
