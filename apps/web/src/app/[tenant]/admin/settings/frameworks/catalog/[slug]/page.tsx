import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { getCatalogFramework } from "@/lib/frameworks/catalog";

// ponytail: placeholder until each framework gets a requirements tracker.
export default async function CatalogFrameworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const framework = getCatalogFramework(slug);
  if (!framework) notFound();
  return (
    <div className="w-full space-y-6 p-5 lg:p-7">
      <PageHeader title={framework.name} description={framework.description} />
      <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border bg-card text-center">
        <Layers className="mb-3 h-8 w-8 text-muted-foreground" />
        <h2 className="font-semibold">Requirements coming soon</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This framework is enabled. Its requirements tracker will appear here.
        </p>
      </div>
    </div>
  );
}
