/**
 * Detects an agent's owner from real AWS resource tags (checked in
 * priority order), matched against Norix users by email. Falls back to
 * "Unowned" with zero confidence when nothing matches — never guesses.
 */

import { db, users } from "@db";
import { eq } from "drizzle-orm";
import type { CorrelatedAgent } from "../aws/correlation";

const OWNER_TAG_KEYS = ["Owner", "owner", "norix:owner", "Team", "team"];
const EMAIL_TAG_KEYS = ["Email", "email", "OwnerEmail", "owner-email"];

export interface OwnershipResult {
  ownerUserId: string | null;
  ownerSource: string | null;
  ownerConfidence: number;
  businessFunction: string | null;
}

export async function detectOwnership(
  agent: CorrelatedAgent,
): Promise<OwnershipResult> {
  const allTags = agent.resources.reduce<Record<string, string>>((acc, r) => {
    return { ...acc, ...r.tags };
  }, {});

  const businessFunction =
    allTags["BusinessFunction"] ??
    allTags["business-function"] ??
    allTags["Team"] ??
    null;

  for (const emailKey of EMAIL_TAG_KEYS) {
    const email = allTags[emailKey];
    if (!email) continue;
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (user) {
      return {
        ownerUserId: user.id,
        ownerSource: `resource_tag:${emailKey}`,
        ownerConfidence: 0.9,
        businessFunction,
      };
    }
  }

  // Managed platforms such as Databricks return authoritative creator/owner
  // principals directly in resource metadata instead of resource tags.
  for (const resource of agent.resources) {
    for (const key of ["owner", "creator", "runAs", "servicePrincipalName"]) {
      const value = resource.metadata[key];
      if (typeof value !== "string" || !value.includes("@")) continue;
      const user = await db.query.users.findFirst({
        where: eq(users.email, value),
      });
      if (user) {
        return {
          ownerUserId: user.id,
          ownerSource: `provider_metadata:${key}`,
          ownerConfidence: 0.85,
          businessFunction,
        };
      }
    }
  }

  for (const ownerKey of OWNER_TAG_KEYS) {
    const value = allTags[ownerKey];
    if (!value) continue;
    // Owner tag might itself be an email address even under a non-email key.
    const user = value.includes("@")
      ? await db.query.users.findFirst({ where: eq(users.email, value) })
      : null;
    if (user) {
      return {
        ownerUserId: user.id,
        ownerSource: `resource_tag:${ownerKey}`,
        ownerConfidence: 0.75,
        businessFunction,
      };
    }
  }

  return {
    ownerUserId: null,
    ownerSource: null,
    ownerConfidence: 0,
    businessFunction,
  };
}
