"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { TrackButton } from "@/components/trust-dossier/TrackButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenant } from "@/contexts/TenantContext";
import { getTrackedVendorSlugs } from "@/lib/actions/trust-dossier";
import { errorToast } from "@/lib/utils/toast";
import {
  GRADE_CLASSES,
  TRUST_DOSSIER_CATEGORIES,
  getTrustDossierScorecard,
} from "@/lib/trust-dossier/vendors";

export default function TrustDossierPage() {
  const { tenant } = useTenant();
  const tenantKey = tenant?.slug ?? tenant?.id ?? "";
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "tracked">("all");
  const [tracked, setTracked] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!tenantKey) return;
    getTrackedVendorSlugs(tenantKey)
      .then((slugs) => setTracked(new Set(slugs)))
      .catch((error) => {
        setTracked(new Set());
        errorToast(error);
      });
  }, [tenantKey]);

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TRUST_DOSSIER_CATEGORIES.map((category) => ({
      ...category,
      vendors: category.vendors.filter(
        (vendor) =>
          (view === "all" || tracked?.has(vendor.slug)) &&
          (!query ||
            vendor.name.toLowerCase().includes(query) ||
            vendor.websites.some((w) => w.label.toLowerCase().includes(query))),
      ),
    })).filter((category) => category.vendors.length > 0);
  }, [search, view, tracked]);

  const setOne = (slug: string, isTracked: boolean) =>
    setTracked((prev) => {
      const next = new Set(prev);
      if (isTracked) next.add(slug);
      else next.delete(slug);
      return next;
    });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Trust Dossier"
        description="Privacy policies, disclosure scores and sub-processors of Neo Cloud & Inference Providers."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="all">All vendors</TabsTrigger>
            <TabsTrigger value="tracked">
              Tracked{tracked ? ` (${tracked.size})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search vendors"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vendors"
            value={search}
          />
        </div>
      </div>

      {visibleCategories.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {view === "tracked" && !search
              ? "You are not tracking any vendors yet. Click Track on a vendor to add it here."
              : `No vendors match “${search}”.`}
          </CardContent>
        </Card>
      )}

      {visibleCategories.map((category) => (
        <section key={category.name} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{category.name}</h2>
            <p className="text-xs text-muted-foreground">
              {category.description}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {category.vendors.map((vendor) => {
              const card = getTrustDossierScorecard(vendor.slug)!;
              const href = `/${tenantKey}/admin/trust-dossier/${vendor.slug}`;
              return (
                <Card key={vendor.slug} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 rounded-md border bg-white">
                        <AvatarImage alt="" src={vendor.logoUrl} />
                        <AvatarFallback className="rounded-md text-xs">
                          {vendor.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={href}
                          className="block truncate text-sm font-semibold hover:underline"
                        >
                          {vendor.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {vendor.websites.map((w) => w.label).join(" · ")}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={GRADE_CLASSES[card.grade]}
                      >
                        {card.grade}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={card.score} className="h-1.5" />
                      <span className="whitespace-nowrap text-xs font-medium">
                        {card.score}/100
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">
                        {vendor.category}
                      </Badge>
                      <span>Rank #{card.rank}</span>
                    </div>
                    <div className="mt-auto flex gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="flex-1"
                      >
                        <Link href={href}>View dossier</Link>
                      </Button>
                      {tracked && (
                        <TrackButton
                          key={`${vendor.slug}-${tracked.has(vendor.slug)}`}
                          tenant={tenantKey}
                          vendorSlug={vendor.slug}
                          vendorName={vendor.name}
                          initialTracked={tracked.has(vendor.slug)}
                          onChange={(t) => setOne(vendor.slug, t)}
                        />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
