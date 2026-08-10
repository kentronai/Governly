import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { getProviderModelsForPlayground } from "@/lib/actions/provider-models-playground";
import { getRecentRedTeamingTests } from "@/lib/queries/red-teaming";
import { db, tenants } from "@db";
import { eq } from "drizzle-orm";
import RedTeamingView from "./RedTeamingView";

// Data-fetching used to live in layout.tsx, which imported this page directly
// and rendered it in place of the router-provided `children` — a layout
// standing in for a page, which is what Next 15's route-type validator
// rejected. Route data-fetching belongs on the page; the layout is now a
// plain passthrough (see layout.tsx).
export default async function Page({
  params,
}: {
  params: Promise<{ tenant: string; applicationId: string }>;
}) {
  const { applicationId } = await params;
  const { orgId } = await auth();

  if (!orgId) return notFound();
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, orgId),
  });
  if (!tenant || tenant === null) return notFound();

  const metadata = tenant.metadata as any;

  // Red Teaming has no product-facing way to set this flag today (no admin
  // toggle, no onboarding step) — only a hand-edited DB row. Until that
  // exists, default the feature to enabled and only respect an explicit
  // `false` so it can still be switched off per tenant later.
  const isEnabled = metadata?.allowRedTeaming !== false;

  const [modelsResult, recentTests] = await Promise.all([
    getProviderModelsForPlayground(),
    getRecentRedTeamingTests(applicationId),
  ]);

  return (
    <RedTeamingView
      models={modelsResult.models}
      isEnabled={isEnabled}
      applicationId={applicationId}
      recentTests={recentTests}
    />
  );
}
