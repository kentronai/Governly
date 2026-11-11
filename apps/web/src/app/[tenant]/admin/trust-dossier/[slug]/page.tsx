import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { TrackButton } from "@/components/trust-dossier/TrackButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getTrackedVendorSlugs } from "@/lib/actions/trust-dossier";
import { GRADE_CLASSES, GRADE_SCALE } from "@/lib/trust-dossier/grades";
import {
  type CheckStatus,
  getTrustDossierScorecard,
  getTrustDossierVendor,
} from "@/lib/trust-dossier/vendors";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<CheckStatus, string> = {
  Disclosed: "bg-emerald-600",
  Partial: "bg-amber-500",
  Silent: "bg-muted-foreground/30",
  "Not applicable": "bg-muted-foreground/60",
};

const GRADE_REASON: Record<string, string> = {
  A: "discloses its data practices clearly",
  B: "discloses most of its data practices",
  C: "discloses some of its data practices, with notable gaps",
  D: "leaves many data practices undisclosed",
  F: "discloses very little about its data practices",
};

export default async function TrustDossierVendorPage({
  params,
}: {
  params: Promise<{ tenant: string; slug: string }>;
}) {
  const { tenant, slug } = await params;
  const vendor = getTrustDossierVendor(slug);
  if (!vendor) notFound();
  const card = getTrustDossierScorecard(slug)!;
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
                    href={vendor.websites[0].url}
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
          <div className="flex max-w-md items-center gap-3">
            <Badge variant="outline" className={GRADE_CLASSES[vendor.grade]}>
              {vendor.grade}
            </Badge>
            <Progress value={vendor.score} className="h-2" />
            <span className="whitespace-nowrap text-sm font-medium">
              {vendor.score}/100
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm">
        {vendor.name} earns{" "}
        <span className="font-semibold">
          {/^[AEF]/.test(vendor.grade) ? "an" : "a"} {vendor.grade} (
          {vendor.score}/100)
        </span>{" "}
        because it {GRADE_REASON[vendor.grade]}.
      </p>

      <Card>
        <CardContent className="grid divide-y p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat
            value={`#${card.rank}`}
            label={`of ${card.total} vendors ranked`}
          />
          <Stat
            value={String(vendor.score)}
            label={`score · ${vendor.category} avg ${card.categoryAverage}`}
          />
          <Stat
            value={`${card.vsCategory >= 0 ? "+" : ""}${card.vsCategory}`}
            label="vs category average"
            className={
              card.vsCategory >= 0 ? "text-emerald-700" : "text-red-700"
            }
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Grade scale
        </span>
        {GRADE_SCALE.map((band) => (
          <Badge
            key={band.grade}
            variant="outline"
            className={cn(
              GRADE_CLASSES[band.grade],
              band.grade === vendor.grade && "ring-2 ring-foreground/40",
            )}
          >
            {band.grade} · {band.min}–{band.max}
          </Badge>
        ))}
      </div>

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
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          {vendor.summary}
        </CardContent>
      </Card>

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Sub-processors
            {vendor.subprocessors.length
              ? ` (${vendor.subprocessors.length})`
              : ""}
          </CardTitle>
          <SourceLink label="Source list" url={vendor.subprocessorsUrl} />
        </CardHeader>
        <CardContent>
          {vendor.subprocessors.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vendor.subprocessors.map((sp, index) => (
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
          ) : (
            <p className="text-sm text-muted-foreground">
              {vendor.subprocessorsNote ??
                "No public sub-processor list has been found for this vendor."}
            </p>
          )}
        </CardContent>
      </Card>

      {vendor.scoreHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score history</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {vendor.scoreHistory.map((h) => (
              <div
                key={h.date}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span className="text-muted-foreground">{h.date}</span>
                <span className="flex items-center gap-2 font-medium">
                  {h.score}/100
                  <Badge variant="outline" className={GRADE_CLASSES[h.grade]}>
                    {h.grade}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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

function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className="p-4 text-center">
      <p className={cn("text-2xl font-bold", className)}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
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
