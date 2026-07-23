import { AgentDiscoveryNav } from "@/components/agent-discovery/AgentDiscoveryNav";

export default async function AgentDiscoveryLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return <div className="space-y-5 p-6"><AgentDiscoveryNav tenant={tenant} />{children}</div>;
}
