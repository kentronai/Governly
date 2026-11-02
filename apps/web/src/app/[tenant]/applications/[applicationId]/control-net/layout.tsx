import React from "react";
import { auth } from "@clerk/nextjs/server";
import { db, users } from "@db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

// ControlNet is restricted to Kentron staff (@kentron.ai), same gate as /ops.
export default async function ControlNetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });

  if (!user?.email?.toLowerCase().endsWith("@kentron.ai")) {
    notFound();
  }
  return <>{children}</>;
}
