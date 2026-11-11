"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  TRUST_DOSSIER_CATEGORIES,
  TRUST_DOSSIER_VENDORS,
} from "@/lib/trust-dossier/vendors";
import { useTenant } from "@/contexts/TenantContext";

export default function TrustDossierPage() {
  const { tenant } = useTenant();
  const [search, setSearch] = useState("");
  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TRUST_DOSSIER_CATEGORIES.map((category) => ({
      ...category,
      vendors: category.vendors.filter(
        (vendor) =>
          !query ||
          vendor.name.toLowerCase().includes(query) ||
          vendor.websites.some((website) =>
            website.label.toLowerCase().includes(query),
          ),
      ),
    })).filter((category) => category.vendors.length > 0);
  }, [search]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Trust Dossier"
        description="Browse cloud and AI infrastructure vendors and review each vendor’s privacy and subprocessor disclosures."
      />

      <section
        aria-labelledby="neo-cloud-inference-heading"
        className="space-y-1"
      >
        <h2 className="text-xl font-semibold" id="neo-cloud-inference-heading">
          Neo Cloud &amp; Inference Provider
        </h2>
        <p className="text-sm text-muted-foreground">
          Neoclouds, GPU marketplaces, AI inference platforms, and
          internationally headquartered providers serving the U.S. market.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {TRUST_DOSSIER_VENDORS.length} vendors
        </p>
        <div className="relative w-full sm:max-w-sm">
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

      {visibleCategories.length > 0 ? (
        visibleCategories.map((category) => (
          <section
            aria-label={category.name}
            className="space-y-3"
            key={category.name}
          >
            <div>
              <h2 className="text-lg font-semibold">{category.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {category.description}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {category.vendors.map((vendor) => (
                <Card key={vendor.slug}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">
                          {vendor.number}. {vendor.name}
                        </CardTitle>
                        <Badge variant="secondary">{vendor.category}</Badge>
                      </div>
                      <Button asChild size="icon" variant="ghost">
                        <Link
                          aria-label={`View ${vendor.name} dossier`}
                          href={`/${tenant?.slug ?? tenant?.id}/admin/trust-dossier/${vendor.slug}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {vendor.websites.map((website) => (
                        <a
                          className="text-sm text-primary underline-offset-4 hover:underline"
                          href={website.url}
                          key={website.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {website.label}
                        </a>
                      ))}
                    </div>
                    <Button asChild className="w-full" variant="outline">
                      <Link
                        href={`/${tenant?.slug ?? tenant?.id}/admin/trust-dossier/${vendor.slug}`}
                      >
                        View dossier
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No vendors match “{search}”.
        </p>
      )}
    </div>
  );
}
