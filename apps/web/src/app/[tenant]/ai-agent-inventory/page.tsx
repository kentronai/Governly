/**
 * AI Agent Inventory — every AI agent discovered by the Agent Registry.
 * Top-level module, peer to Applications. Data comes exclusively from the
 * `agents` table (real discovered agents), never from `applications`.
 */

import { auth } from "@clerk/nextjs/server";
import { AgentInventory } from "./_components/AgentInventory";
import { AgentDiscoveryNav } from "@/components/agent-discovery/AgentDiscoveryNav";
import { getAgentInventoryInitialData } from "@/lib/queries/agents";

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ autonomy?: string }>;
}

const VALID_AUTONOMY = ["L1", "L2", "L3", "L4"];

export default async function AgentInventoryPage({ params, searchParams }: PageProps) {
  const { tenant } = await params;
  const { autonomy } = await searchParams;
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  // Fetch the server-rendered initial state so the client component hydrates
  // with real data (and the autonomy filter from the URL) instead of crashing
  // on an undefined `initialData`.
  const autonomyLevel =
    autonomy && VALID_AUTONOMY.includes(autonomy) ? autonomy : undefined;
  const initialData = await getAgentInventoryInitialData(orgId, {
    autonomyLevel,
  });

  return (
    <div className="space-y-5 p-6">
      <AgentDiscoveryNav tenant={tenant} />
      <AgentInventory
        tenant={tenant}
        initialAutonomy={autonomy}
        initialData={initialData}
      />
    </div>
  );
}
