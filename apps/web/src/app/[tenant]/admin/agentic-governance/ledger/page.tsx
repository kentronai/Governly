import { redirect } from "next/navigation";

export default async function GovernanceLedger({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/${tenant}/admin/settings/audit-logs`);
}
