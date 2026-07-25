import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import * as relation from "./relations";
const connectionString = process.env.DATABASE_URL!;

// Singleton pattern for Next.js app directory
// Prevents creating multiple connection pools during hot reloads
declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof postgres> | undefined;
}

if (!globalThis.__db) {
  globalThis.__db = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    // Raised from 10s: under load (or right after Postgres restarts) a 10s
    // connect budget surfaced transient "write CONNECT_TIMEOUT postgres:5432"
    // errors to users. 30s absorbs those blips without hanging real outages.
    connect_timeout: 30,
    // Recycle connections hourly so a long-lived pool never accumulates
    // half-dead sockets that fail the next query.
    max_lifetime: 60 * 60,
  });
}

const queryClient = globalThis.__db;

export const db = drizzle(queryClient, {
  schema: {
    ...schema,
    ...relation,
  },
});

export const migrationClient = postgres(connectionString, { max: 1 });

// Re-export types
export * from "./relations";
export * from "./schema";
export type * from "./schema";
