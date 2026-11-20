import TestRuns from "@/components/test-runs/TestRuns";

export default async function ControlNetTestRunsPage({
  params,
}: {
  params: Promise<{ tenant: string; applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <TestRuns applicationId={applicationId} />;
}
