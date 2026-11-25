import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { TrackButton } from "@/components/trust-dossier/TrackButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getTrackedVendorSlugs } from "@/lib/actions/trust-dossier";
import { getSubprocessorOverrides } from "@/lib/server/trust-dossier/agent";
import {
  CATALOG_RESEARCHED_ON,
  type CheckStatus,
  getTrustDossierVendor,
} from "@/lib/trust-dossier/vendors";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STATUS_DOT: Record<CheckStatus, string> = {
  Disclosed: "bg-emerald-600",
  Partial: "bg-amber-500",
  "Not disclosed": "bg-muted-foreground/30",
  "Not applicable": "bg-muted-foreground/60",
};

export default async function TrustDossierVendorPage({
  params,
}: {
  params: Promise<{ tenant: string; slug: string }>;
}) {
  const { tenant, slug } = await params;
  const base = getTrustDossierVendor(slug);
  if (!base) notFound();
  // The agent's latest verified list (from the vendor's own page) wins over the static catalog.
  const override = (await getSubprocessorOverrides().catch(() => null))?.get(slug);
  const vendor = override?.subprocessors.length
    ? { ...base, subprocessors: override.subprocessors, subprocessorsUrl: override.sourceUrl }
    : base;
  // "Last updated" = when the agent last verified this list. A failed or skipped run never touches it.
  const checkedOn = override?.lastCheckedAt ?? base.lastChecked ?? CATALOG_RESEARCHED_ON;
  const listUpdated = format(
    new Date(checkedOn.length === 10 ? `${checkedOn}T00:00:00` : checkedOn),
    "d MMMM yyyy",
  );
  const trackedSlugs = await getTrackedVendorSlugs(tenant).catch(
    (): string[] => [],
  );

  const details = [
    ["Company", vendor.company],
    ["Category", vendor.category],
    ["Audience", vendor.audience],
    ["Assessment confidence", vendor.confidence],
    ["Modalities", vendor.modalities?.join(", ")],
    ["Trains on customer data", vendor.trainsOnCustomerData],
    ["Certifications", vendor.certifications?.join(", ")],
    ["Sub-processors last updated", listUpdated],
    ["Policy last updated", vendor.policyLastUpdated],
    ["Last checked", vendor.lastChecked],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="space-y-6 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/${tenant}/admin/trust-dossier`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Trust Dossier
        </Link>
      </Button>

      <div className="flex items-start gap-4">
        <Avatar className="h-14 w-14 rounded-lg border bg-white">
          <AvatarImage alt="" src={vendor.logoUrl} />
          <AvatarFallback className="rounded-lg">
            {vendor.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <PageHeader
            title={vendor.name}
            description={[
              vendor.company,
              vendor.category,
              vendor.confidence && `${vendor.confidence} confidence`,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              <div className="flex gap-2">
                <TrackButton
                  tenant={tenant}
                  vendorSlug={vendor.slug}
                  vendorName={vendor.name}
                  initialTracked={trackedSlugs.includes(vendor.slug)}
                />
                <Button asChild variant="outline" size="sm">
                  <a
                    href={vendor.privacyPolicyUrl ?? vendor.websites[0].url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {vendor.websites[0].label}
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            }
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          {vendor.summary}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Sub-processors
            {vendor.subprocessors.length
              ? ` (${vendor.subprocessors.length})`
              : ""}
          </CardTitle>
          <div className="flex flex-col items-end gap-1">
            <SourceLink label="Source list" url={vendor.subprocessorsUrl} />
            <span className="text-xs text-muted-foreground">
              Last updated {listUpdated}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {vendor.subprocessors.length ? (
            <div className="space-y-3">
              <SubprocessorGrid items={vendor.subprocessors.slice(0, 4)} />
              {vendor.subprocessors.length > 4 && (
                // ponytail: native <details> instead of a client toggle.
                <details className="group space-y-3">
                  <summary
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "cursor-pointer list-none",
                    )}
                  >
                    <span className="group-open:hidden">
                      View all {vendor.subprocessors.length} sub-processors
                    </span>
                    <span className="hidden group-open:inline">Show fewer</span>
                  </summary>
                  <SubprocessorGrid items={vendor.subprocessors.slice(4)} />
                </details>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sub-processor vendors found
              {vendor.subprocessorsNote
                ? ` — ${vendor.subprocessorsNote}.`
                : "."}
            </p>
          )}
        </CardContent>
      </Card>

      {vendor.redFlags.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Red flags in the policy</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {vendor.redFlags.map((flag, i) => (
                <li key={i}>“{flag}”</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Highlights</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {vendor.highlights.map((h, i) => (
            <div key={`${h.title}-${i}`} className="rounded-md border p-3">
              <h3 className="text-sm font-semibold">{h.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{h.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Privacy policy disclosures
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-0 pb-2">
          {vendor.sections.map((section) => {
            const disclosed = section.items.filter(
              (i) => i.status === "Disclosed",
            ).length;
            return (
              <section key={section.name}>
                <div className="space-y-2 border-y bg-muted/40 px-6 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <h3 className="font-semibold">{section.name}</h3>
                    <span className="text-muted-foreground">
                      {disclosed} of {section.items.length} disclosed
                    </span>
                  </div>
                  <Progress
                    value={(disclosed / section.items.length) * 100}
                    className="h-1.5"
                  />
                </div>
                <ul className="divide-y">
                  {section.items.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-center justify-between gap-4 px-6 py-2.5 text-sm"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            STATUS_DOT[item.status],
                          )}
                        />
                        {item.label}
                      </span>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details and sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <SourceLink label="Privacy policy" url={vendor.privacyPolicyUrl} />
            {vendor.sourcesChecked
              .filter((u) => u !== vendor.privacyPolicyUrl)
              .map((u) => (
                <SourceLink key={u} label={u} url={u} />
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubprocessorGrid({
  items,
}: {
  items: { name: string; purpose: string; location: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((sp, index) => (
        <div
          key={`${sp.name}-${index}`}
          className="space-y-1 rounded-md border p-3"
        >
          <h3 className="text-sm font-semibold">{sp.name}</h3>
          <p className="text-sm text-muted-foreground">{sp.purpose}</p>
          <p className="text-xs text-muted-foreground">
            Location: {sp.location}
          </p>
        </div>
      ))}
    </div>
  );
}

function SourceLink({ label, url }: { label: string; url?: string }) {
  if (!url) return null;
  return (
    <a
      className="inline-flex items-center break-all text-sm text-primary underline-offset-4 hover:underline"
      href={url}
      rel="noopener noreferrer"
      target="_blank"
    >
      {label}
      <ArrowUpRight className="ml-1 h-3 w-3 shrink-0" />
    </a>
  );
}
