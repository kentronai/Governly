import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { getModelCatalog } from "@/lib/server/model-catalog";
import { ModelCatalog } from "../_components/ModelCatalog";

export default async function ModelCatalogPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const { userId, orgId } = await auth();
  if (!userId || !orgId) throw new Error("Authentication required");

  const models = await getModelCatalog();
  const providers = new Set(models.map((m) => m.provider)).size;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Model Catalog"
        description={`Browse ${models.length.toLocaleString()} LLM models across ${providers} providers. Pricing and capabilities from LiteLLM, refreshed daily.`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/${tenant}/model-registry`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Approved models
            </Link>
          </Button>
        }
      />
      <ModelCatalog models={models} />
    </div>
  );
}
