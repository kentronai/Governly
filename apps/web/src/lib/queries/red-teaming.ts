/**
 * Server-side queries for Red Teaming
 * Used in Server Components (SSR)
 */

import { db, redTeamingTests } from "@db";
import { eq, desc } from "drizzle-orm";
import { cache } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  toxicity: "Toxicity",
  pii: "PII",
  jailbreak: "Jailbreak",
  injection: "Injection",
  "data-exfil": "Data Exfiltration",
  political: "Political",
};

function relativeTime(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export const getRecentRedTeamingTests = cache(
  async (applicationId: string, limit = 10) => {
    const rows = await db.query.redTeamingTests.findMany({
      where: eq(redTeamingTests.applicationId, applicationId),
      orderBy: [desc(redTeamingTests.testedAt), desc(redTeamingTests.createdAt)],
      limit,
    });

    return rows.map((row) => {
      const metadata = row.metadata as { category?: string } | null;
      const category = metadata?.category
        ? (CATEGORY_LABELS[metadata.category] ?? metadata.category)
        : row.testType;

      return {
        id: row.id,
        prompt: row.testName,
        status: row.testStatus ?? "warning",
        category,
        time: relativeTime(row.testedAt ?? row.createdAt),
      };
    });
  },
);
