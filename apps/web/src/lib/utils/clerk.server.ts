// src/lib/utils/clerk.server.ts
import { auth } from '@clerk/nextjs/server';
import { db, users } from '@db';
import { eq } from 'drizzle-orm';

export async function getCurrentUserServer() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new Error('User not authenticated');
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const tenantId = orgId || userId;
  
  if (!tenantId) {
    throw new Error('No tenant ID available');
  }

  return {
    userId,
    tenantId,
    userRole: orgRole ?? undefined,
    orgRole,
    isAdmin: orgRole === 'org:admin' || user?.email?.toLowerCase().endsWith('@kentron.ai') === true,
    user,
  };
}
