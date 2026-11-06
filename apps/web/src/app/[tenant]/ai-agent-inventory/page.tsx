/**
 * AI Agent Inventory — every AI agent discovered by the Agent Registry.
 * Top-level module, peer to Applications. Data comes exclusively from the
 * `agents` table (real discovered agents), never from `applications`.
 */

import { auth } from "@clerk/nextjs/server";
import { AgentInventory } from "./_components/AgentInventory";
import { AgentDiscoveryNav } from "@/components/agent-discovery/AgentDiscoveryNav";
import { resolveAgentDiscoveryTenantId } from "@/lib/queries/agent-dashboard";
import { getAgentInventoryInitialData } from "@/lib/queries/agents";

interface PageProps {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ autonomy?: string }>;
}

export default async function AgentInventoryPage({
  params,
  searchParams,
}: PageProps) {
  const { tenant } = await params;
  const { autonomy } = await searchParams;
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  const tenantId = await resolveAgentDiscoveryTenantId(tenant);
  if (tenantId !== orgId) {
    throw new Error("Tenant access denied");
  }

  // Server-rendered initial state so the client hydrates with real data (and
  // the autonomy filter from the URL) instead of crashing on undefined data.
  const initialData = await getAgentInventoryInitialData(tenantId, {
    autonomyLevel:
      autonomy && ["L1", "L2", "L3", "L4"].includes(autonomy)
        ? autonomy
        : undefined,
    page: 1,
    pageSize: 20,
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
