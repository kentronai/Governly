import { redirect } from "next/navigation";

// The EU AI Act tracker now lives with the other frameworks; keep old links working.
export default async function EuAiActRedirect({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}/admin/settings/frameworks/eu-ai-act`);
}
