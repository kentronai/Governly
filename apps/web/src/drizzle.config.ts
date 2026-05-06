import type { Config } from "drizzle-kit";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from root .env file
config({
  path: [
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), "../../.env"),
  ],
});

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",

  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? ""),
  },
} satisfies Config;
