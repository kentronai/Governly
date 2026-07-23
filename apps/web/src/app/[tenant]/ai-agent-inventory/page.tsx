/**
 * AI Agent Inventory — every AI agent discovered by the Agent Registry.
 * Top-level module, peer to Applications. Data comes exclusively from the
 * `agents` table (real discovered agents), never from `applications`.
 */

import { auth } from "@clerk/nextjs/server";
import { AgentInventory } from "./_components/AgentInventory";
import { AgentDiscoveryNav } from "@/components/agent-discovery/AgentDiscoveryNav";

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ autonomy?: string }>;
}

export default async function AgentInventoryPage({ params, searchParams }: PageProps) {
  const { tenant } = await params;
  const { autonomy } = await searchParams;
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  return (
    <div className="space-y-5 p-6">
      <AgentDiscoveryNav tenant={tenant} />
      <AgentInventory tenant={tenant} initialAutonomy={autonomy} />
    </div>
  );
}
