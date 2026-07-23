import { redirect } from "next/navigation";

export default async function AgentPolicies({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/${tenant}/admin/settings/policy-center`);
}
