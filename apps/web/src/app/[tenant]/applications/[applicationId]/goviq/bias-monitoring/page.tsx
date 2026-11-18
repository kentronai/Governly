import FairnessChecks from "@/components/fairness/FairnessChecks";

export default async function BiasMonitoringPage({
  params,
}: {
  params: Promise<{ tenant: string; applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <FairnessChecks applicationId={applicationId} />;
}
