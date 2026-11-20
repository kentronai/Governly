import Datasets from "@/components/test-runs/Datasets";

export default async function ControlNetDatasetsPage({
  params,
}: {
  params: Promise<{ tenant: string; applicationId: string }>;
}) {
  const { applicationId } = await params;
  return <Datasets applicationId={applicationId} />;
}
