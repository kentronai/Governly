import { auth } from "@clerk/nextjs/server";
import Observability from "@/components/observability";
import { TenantObservabilityIntegrationsStore } from "@/store/tenantLogs.store";

export default async function page() {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    throw new Error("Authentication required");
  }

  return (
    <TenantObservabilityIntegrationsStore>
      <Observability />
    </TenantObservabilityIntegrationsStore>
  );
}
