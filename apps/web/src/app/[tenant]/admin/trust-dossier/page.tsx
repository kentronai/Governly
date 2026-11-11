import { PageHeader } from "@/components/common/PageHeader";
import { TrustDossierBrowser } from "@/components/trust-dossier/TrustDossierBrowser";
import {
  TRUST_DOSSIER_VENDORS,
  getTrustDossierScorecard,
} from "@/lib/trust-dossier/vendors";

export default async function TrustDossierPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  // Only the fields a card needs go to the client; the full catalog stays on the server.
  const cards = TRUST_DOSSIER_VENDORS.map((v) => ({
    slug: v.slug,
    name: v.name,
    collection: v.collection,
    group: v.group,
    category: v.category,
    domains: v.websites.map((w) => w.label).join(" · "),
    logoUrl: v.logoUrl,
    grade: v.grade,
    score: v.score,
    rank: getTrustDossierScorecard(v.slug)!.rank,
  }));

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Trust Dossier"
        description="Privacy disclosures, scores and sub-processors for cloud, inference and AI application vendors."
      />
      <TrustDossierBrowser tenant={tenant} cards={cards} />
    </div>
  );
}
