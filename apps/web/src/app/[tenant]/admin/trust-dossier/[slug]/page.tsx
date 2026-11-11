import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileText } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTrustDossierVendor } from "@/lib/trust-dossier/vendors";

export default async function TrustDossierVendorPage({
  params,
}: {
  params: Promise<{ tenant: string; slug: string }>;
}) {
  const { tenant, slug } = await params;
  const vendor = getTrustDossierVendor(slug);
  if (!vendor) notFound();

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={vendor.name}
        description={`Trust Dossier · ${vendor.category}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/${tenant}/admin/trust-dossier`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              All vendors
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{vendor.category}</Badge>
        <span className="text-sm text-muted-foreground">
          Vendor #{vendor.number}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Official websites</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {vendor.websites.map((website) => (
            <Button asChild key={website.url} variant="outline">
              <a href={website.url} rel="noopener noreferrer" target="_blank">
                {website.label}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <DisclosureCard
          title="Privacy policy"
          url={vendor.privacyPolicyUrl}
          websiteUrl={vendor.websites[0].url}
        />
        <DisclosureCard
          title="Subprocessors"
          url={vendor.subprocessorsUrl}
          websiteUrl={vendor.websites[0].url}
        />
      </div>
    </div>
  );
}

function DisclosureCard({
  title,
  url,
  websiteUrl,
}: {
  title: string;
  url?: string;
  websiteUrl: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <FileText
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground"
        />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {url ? (
          <Button asChild variant="link" className="h-auto p-0">
            <a href={url} rel="noopener noreferrer" target="_blank">
              View official {title.toLowerCase()}
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              An official {title.toLowerCase()} link has not been verified yet.
            </p>
            <a
              className="text-sm text-primary underline-offset-4 hover:underline"
              href={websiteUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Check the vendor’s official website
              <ArrowUpRight className="ml-1 inline h-3 w-3" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
