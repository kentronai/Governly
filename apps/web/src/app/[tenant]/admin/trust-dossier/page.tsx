import { PageHeader } from "@/components/common/PageHeader";
import { TrustDossierBrowser } from "@/components/trust-dossier/TrustDossierBrowser";
import { getSubprocessorOverrides } from "@/lib/server/trust-dossier/agent";
import { TRUST_DOSSIER_VENDORS } from "@/lib/trust-dossier/vendors";

export default async function TrustDossierPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const overrides = await getSubprocessorOverrides().catch(() => new Map());
  // Only the fields a card needs go to the client; the full catalog stays on the server.
  const cards = TRUST_DOSSIER_VENDORS.map((v) => ({
    slug: v.slug,
    name: v.name,
    company: v.company,
    summary: v.summary,
    hasRedFlags: v.redFlags.length > 0,
    collection: v.collection,
    group: v.group,
    category: v.category,
    domains: v.websites.map((w) => w.label).join(" · "),
    logoUrl: v.logoUrl,
    subprocessorCount: (overrides.get(v.slug)?.subprocessors.length ?? v.subprocessors.length),
  }));

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Trust Dossier"
        description="Privacy disclosures and sub-processors for cloud, inference and AI application vendors."
      />
      <TrustDossierBrowser tenant={tenant} cards={cards} />
    </div>
  );
}
