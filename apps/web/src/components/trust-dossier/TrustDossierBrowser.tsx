"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TrackButton } from "@/components/trust-dossier/TrackButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTrackedVendorSlugs } from "@/lib/actions/trust-dossier";
import {
  COLLECTIONS,
  GRADE_CLASSES,
  GRADE_SCALE,
} from "@/lib/trust-dossier/grades";
import { errorToast } from "@/lib/utils/toast";

export interface TrustDossierCard {
  slug: string;
  name: string;
  collection: string;
  group: string;
  category: string;
  domains: string;
  logoUrl: string;
  grade: string;
  score: number;
  rank: number;
}

type View = (typeof COLLECTIONS)[number]["id"] | "tracked";

export function TrustDossierBrowser({
  tenant,
  cards,
}: {
  tenant: string;
  cards: TrustDossierCard[];
}) {
  const [view, setView] = useState<View>("neo-cloud");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  const [tracked, setTracked] = useState<Set<string> | null>(null);

  useEffect(() => {
    getTrackedVendorSlugs(tenant)
      .then((slugs) => setTracked(new Set(slugs)))
      .catch((error) => {
        setTracked(new Set());
        errorToast(error);
      });
  }, [tenant]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = cards.filter(
      (c) =>
        (view === "tracked" ? tracked?.has(c.slug) : c.collection === view) &&
        (grade === "all" || c.grade === grade) &&
        (!query ||
          c.name.toLowerCase().includes(query) ||
          c.domains.toLowerCase().includes(query) ||
          c.category.toLowerCase().includes(query)),
    );
    const byGroup = new Map<string, TrustDossierCard[]>();
    for (const c of visible) {
      byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    }
    return [...byGroup];
  }, [cards, view, grade, search, tracked]);

  const setOne = (slug: string, isTracked: boolean) =>
    setTracked((prev) => {
      const next = new Set(prev);
      if (isTracked) next.add(slug);
      else next.delete(slug);
      return next;
    });

  const count = (id: string) => cards.filter((c) => c.collection === id).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            {COLLECTIONS.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.name} ({count(c.id)})
              </TabsTrigger>
            ))}
            <TabsTrigger value="tracked">
              Tracked{tracked ? ` (${tracked.size})` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="w-32" aria-label="Filter by grade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {GRADE_SCALE.map((g) => (
                <SelectItem key={g.grade} value={g.grade}>
                  Grade {g.grade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search vendors"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vendors or categories"
              value={search}
            />
          </div>
        </div>
      </div>

      {groups.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {view === "tracked" && !search && grade === "all"
              ? "You are not tracking any vendors yet. Click Track on a vendor to add it here."
              : "No vendors match these filters."}
          </CardContent>
        </Card>
      )}

      {groups.map(([group, items]) => (
        <section key={group} className="space-y-3">
          <h2 className="text-sm font-semibold">
            {group}{" "}
            <span className="font-normal text-muted-foreground">
              ({items.length})
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((c) => {
              const href = `/${tenant}/admin/trust-dossier/${c.slug}`;
              return (
                <Card key={c.slug} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-9 w-9 rounded-md border bg-white">
                        <AvatarImage alt="" src={c.logoUrl} />
                        <AvatarFallback className="rounded-md text-xs">
                          {c.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={href}
                          className="block truncate text-sm font-semibold hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.domains}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={GRADE_CLASSES[c.grade]}
                      >
                        {c.grade}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={c.score} className="h-1.5" />
                      <span className="whitespace-nowrap text-xs font-medium">
                        {c.score}/100
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="secondary"
                        className="truncate font-normal"
                      >
                        {c.category}
                      </Badge>
                      <span className="whitespace-nowrap">Rank #{c.rank}</span>
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
                          key={`${c.slug}-${tracked.has(c.slug)}`}
                          tenant={tenant}
                          vendorSlug={c.slug}
                          vendorName={c.name}
                          initialTracked={tracked.has(c.slug)}
                          onChange={(t) => setOne(c.slug, t)}
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
