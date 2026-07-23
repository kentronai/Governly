import { redirect } from "next/navigation";

export default async function LiveMonitoring({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/${tenant}/observability`);
}
