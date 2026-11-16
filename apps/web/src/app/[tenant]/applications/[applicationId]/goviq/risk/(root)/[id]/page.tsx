import { db, riskMitigationStatus, risks } from "@/db";
import { and, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Tab from "./_components/tabs";
import { Risk } from "./type";
import View from "./view";
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  const { orgId } = await auth();
  if (!orgId) return notFound();

  const risk = (await db.query.risks.findFirst({
    where: and(eq(risks.id, id), eq(risks.tenantId, orgId)),
    with: {
      useCase: {
        columns: { id: true, whatItDoes: true, useCase: true },
      },
      ownerUser: {
        columns: { name: true, email: true },
      },
      controlOwnerUser: {
        columns: { name: true, email: true },
      },
    },
  })) as Risk;

  if (!risk) return notFound();

  return (
    <div className="p-8 space-y-10">
      <div className="flex gap-2 items-center">
        <View risk={risk}></View >
      </div>
      <Tab risk={risk}></Tab>
    </div>
  );
}
