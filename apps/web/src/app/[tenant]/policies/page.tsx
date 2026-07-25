import { fetchTenantPolicies } from "@/lib/actions/tenant-default-policy";
import { TenantPoliciesClient } from "./TenantPoliciesClient";

interface PageProps {
  params: Promise<{ tenant: string }>;
}

export default async function PoliciesPage({ params }: PageProps) {
  const { tenant } = await params;
  const initialPolicies = await fetchTenantPolicies(tenant);

  return (
    <div className="min-h-screen bg-background p-6">
      <TenantPoliciesClient tenant={tenant} initialPolicies={initialPolicies} />
    </div>
  );
}

