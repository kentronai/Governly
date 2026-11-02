import { clerkClient } from "@clerk/nextjs/server";
import { db, users } from "@db";
import { eq } from "drizzle-orm";

// Written when a users row had to be created without a known email.
export const PLACEHOLDER_EMAIL_SUFFIX = "@unknown.local";

export const isPlaceholderEmail = (email?: string | null) =>
  !email || email.endsWith(PLACEHOLDER_EMAIL_SUFFIX);

type ClerkIdentity = { email: string | null; name: string | null; imageUrl: string | null };

/**
 * Look a user up in Clerk by id. Unlike currentUser(), this does not depend on
 * the request's session context, so it also works where Clerk middleware
 * context is missing (which is how placeholder emails got written).
 */
export async function fetchClerkIdentity(userId: string): Promise<ClerkIdentity | null> {
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const email =
      user.emailAddresses.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses[0]?.emailAddress ||
      null;
    const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || null;
    return { email, name, imageUrl: user.imageUrl || null };
  } catch (error) {
    console.error(`Failed to fetch Clerk identity for ${userId}:`, error);
    return null;
  }
}

/**
 * Replace placeholder emails on the given users rows with their real Clerk
 * email, persisting the fix. Returns a map of userId -> resolved email.
 */
export async function healPlaceholderEmails(
  rows: Array<{ id: string; email: string | null }>,
): Promise<Map<string, string>> {
  const healed = new Map<string, string>();
  const broken = rows.filter((row) => isPlaceholderEmail(row.email));
  await Promise.all(
    broken.map(async (row) => {
      const identity = await fetchClerkIdentity(row.id);
      if (!identity?.email) return;
      await db.update(users).set({ email: identity.email }).where(eq(users.id, row.id));
      healed.set(row.id, identity.email);
    }),
  );
  return healed;
}
