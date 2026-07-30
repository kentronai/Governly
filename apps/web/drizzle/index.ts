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
    max: 20,
    idle_timeout: 60,
    // Raised from 10s: under load (or right after Postgres restarts) a 10s
    // connect budget surfaced transient "write CONNECT_TIMEOUT postgres:5432"
    // errors to users. 60s absorbs those blips without hanging real outages.
    connect_timeout: 60,
    // Recycle connections hourly so a long-lived pool never accumulates
    // half-dead sockets that fail the next query.
    max_lifetime: 60 * 60,
  });
}

const queryClient = globalThis.__db;

const TRANSIENT_DB_ERROR =
  /CONNECT_TIMEOUT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|Connection terminated|connection timeout/i;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const cause = (error as { cause?: unknown })?.cause;
      const causeMessage =
        cause instanceof Error ? cause.message : cause ? String(cause) : "";
      const message =
        error instanceof Error
          ? `${error.message} ${causeMessage}`
          : String(error);
      if (!TRANSIENT_DB_ERROR.test(message) || attempt === attempts) {
        throw error;
      }
      await delay(150 * attempt * attempt);
    }
  }
  throw lastError;
}

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
