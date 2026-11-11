import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { TrackButton } from "@/components/trust-dossier/TrackButton";
import { getTrackedVendorSlugs } from "@/lib/actions/trust-dossier";
import {
  GRADE_CLASSES,
  GRADE_SCALE,
  TRUST_DOSSIER_RUBRIC,
  type CheckStatus,
  getTrustDossierDetails,
  getTrustDossierScorecard,
  getTrustDossierVendor,
} from "@/lib/trust-dossier/vendors";

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
  const details = getTrustDossierDetails(slug);
  const card = getTrustDossierScorecard(slug)!;
  const checks = details?.checks ?? {};
  const trackedSlugs = await getTrackedVendorSlugs(tenant).catch((): string[] => []);

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
              details?.company && details.company !== "Not stated"
                ? details.company
                : null,
              vendor.category,
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
            <Badge variant="outline" className={GRADE_CLASSES[card.grade]}>
              {card.grade}
            </Badge>
            <Progress value={card.score} className="h-2" />
            <span className="whitespace-nowrap text-sm font-medium">
              {card.score}/100
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm">
        {vendor.name} earns{" "}
        <span className="font-semibold">
          {/^[AEF]/.test(card.grade) ? "an" : "a"} {card.grade} ({card.score}
          /100)
        </span>{" "}
        because it {GRADE_REASON[card.grade]}.
      </p>

      <Card>
        <CardContent className="grid divide-y p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat
            value={`#${card.rank}`}
            label={`of ${card.total} vendors ranked`}
          />
          <Stat
            value={String(card.score)}
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
              band.grade === card.grade && "ring-2 ring-foreground/40",
            )}
          >
            {band.grade} · {band.min}–{band.max}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed">
          {details?.summary ??
            "Dossier details for this vendor have not been compiled yet."}
        </CardContent>
      </Card>

      {details?.highlights?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Highlights</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {details.highlights.map((h) => (
              <div key={h.title} className="rounded-md border p-3">
                <h3 className="text-sm font-semibold">{h.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{h.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Privacy policy disclosures
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-0 pb-2">
          {TRUST_DOSSIER_RUBRIC.map((section) => {
            const disclosed = section.items.filter(
              (i) => checks[i.id] === "Disclosed",
            ).length;
            return (
              <section key={section.id}>
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
                  {section.items.map((item) => {
                    const status: CheckStatus = checks[item.id] ?? "Silent";
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-4 px-6 py-2.5 text-sm"
                      >
                        <span className="flex items-center gap-3">
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              STATUS_DOT[status],
                            )}
                          />
                          {item.label}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">
                          {status}
                        </span>
                      </li>
                    );
                  })}
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
            {details?.subprocessors.length
              ? ` (${details.subprocessors.length})`
              : ""}
          </CardTitle>
          <SourceLink label="Source list" url={vendor.subprocessorsUrl} />
        </CardHeader>
        <CardContent>
          {details?.subprocessors.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {details.subprocessors.map((sp, index) => (
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
              {details?.subprocessorsNote ??
                "No public sub-processor list has been found for this vendor."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Policy last updated: {details?.policyLastUpdated ?? "Not stated"}
          </p>
          <div className="flex flex-col gap-1">
            <SourceLink label="Privacy policy" url={vendor.privacyPolicyUrl} />
            {(details?.sourcesChecked ?? [])
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
