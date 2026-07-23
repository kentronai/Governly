import { redirect } from "next/navigation";

export default async function LegacyAgentDashboard({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/${tenant}/ai-agent-discovery/dashboard`);
}
