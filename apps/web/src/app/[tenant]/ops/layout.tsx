import React from "react";
import Feedback from "@/components/admin/feedback";
import { auth } from "@clerk/nextjs/server";
import { db, users } from "@db";
import { eq } from "drizzle-orm";
import OpsTabs from "@/components/ops/Tabs";
import { notFound } from "next/navigation";
export default async function OpsLayout({
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
  const email = user?.email?.toLowerCase();

  if (!email?.endsWith("@kentron.ai")) {
    notFound();
  }
  return (
    <>
      <div className="relative">
        <OpsTabs></OpsTabs>
        {children}
      </div>
      <Feedback />
    </>
  );
}
