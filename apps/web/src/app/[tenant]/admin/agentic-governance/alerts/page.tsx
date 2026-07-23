import { redirect } from "next/navigation";

export default async function AgentAlerts({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/${tenant}/ai-agent-inventory`);
}
