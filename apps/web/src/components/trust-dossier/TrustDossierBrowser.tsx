"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { TrackButton } from "@/components/trust-dossier/TrackButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getTrackedVendorSlugs,
  trackVendors,
} from "@/lib/actions/trust-dossier";
import {
  COLLECTIONS,
  GRADE_CLASSES,
  GRADE_SCALE,
} from "@/lib/trust-dossier/grades";
import { cn } from "@/lib/utils";
import { errorToast, infoToast } from "@/lib/utils/toast";

export interface TrustDossierCard {
  slug: string;
  name: string;
  company?: string;
  summary: string;
  hasRedFlags: boolean;
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

// Same underlined tab style as the Frameworks controls center.
const TAB_LIST =
  "h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0";
const TAB_TRIGGER =
  "h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2 text-muted-foreground shadow-none data-[state=active]:border-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

const SORTS = {
  "score-desc": {
    label: "Best score first",
    fn: (a: TrustDossierCard, b: TrustDossierCard) => b.score - a.score,
  },
  "score-asc": {
    label: "Lowest score first",
    fn: (a: TrustDossierCard, b: TrustDossierCard) => a.score - b.score,
  },
  name: {
    label: "Name A–Z",
    fn: (a: TrustDossierCard, b: TrustDossierCard) =>
      a.name.localeCompare(b.name),
  },
} as const;

export function TrustDossierBrowser({
  tenant,
  cards,
}: {
  tenant: string;
  cards: TrustDossierCard[];
}) {
  const [view, setView] = useState<View>("neo-cloud");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [grade, setGrade] = useState("all");
  const [sort, setSort] = useState<keyof typeof SORTS>("score-desc");
  const [tracked, setTracked] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getTrackedVendorSlugs(tenant)
      .then((slugs) => setTracked(new Set(slugs)))
      .catch(() => {
        setTracked(new Set());
        // Raw server errors (SQL, stack) are not useful to the user.
        errorToast(
          new Error("Couldn't load your tracked vendors. Please refresh."),
        );
      });
  }, [tenant]);

  const changeView = (next: View) => {
    setView(next);
    setCategory("all");
    setSelected(new Set());
  };

  // Cards in the current tab, before the category/grade/search filters.
  const inView = useMemo(
    () =>
      cards.filter((c) =>
        view === "tracked" ? tracked?.has(c.slug) : c.collection === view,
      ),
    [cards, view, tracked],
  );

  const query = search.trim().toLowerCase();
  const matchesSearch = (c: TrustDossierCard) =>
    !query ||
    c.name.toLowerCase().includes(query) ||
    (c.company ?? "").toLowerCase().includes(query) ||
    c.domains.toLowerCase().includes(query);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of inView)
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [inView]);

  const inCategory = inView.filter(
    (c) => category === "all" || c.category === category,
  );
  const gradeCount = (g: string) =>
    inCategory.filter((c) => c.grade === g).length;

  const visible = inCategory
    .filter((c) => (grade === "all" || c.grade === grade) && matchesSearch(c))
    .sort(SORTS[sort].fn);

  const untrackedVisible = visible.filter((c) => !tracked?.has(c.slug));
  const allSelected =
    untrackedVisible.length > 0 &&
    untrackedVisible.every((c) => selected.has(c.slug));

  const toggleSelected = (slug: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });

  const setOne = (slug: string, isTracked: boolean) => {
    setTracked((prev) => {
      const next = new Set(prev);
      if (isTracked) next.add(slug);
      else next.delete(slug);
      return next;
    });
    toggleSelected(slug, false);
  };

  const trackSelected = () =>
    startTransition(async () => {
      const slugs = [...selected];
      try {
        await trackVendors(tenant, slugs);
        setTracked((prev) => new Set([...(prev ?? []), ...slugs]));
        setSelected(new Set());
        infoToast(
          `Tracking ${slugs.length} vendor${slugs.length === 1 ? "" : "s"}`,
        );
      } catch (error) {
        errorToast(error);
      }
    });

  const count = (id: string) => cards.filter((c) => c.collection === id).length;

  return (
    <div className="space-y-5">
      <Tabs value={view} onValueChange={(v) => changeView(v as View)}>
        <TabsList className={TAB_LIST}>
          {COLLECTIONS.map((c) => (
            <TabsTrigger key={c.id} value={c.id} className={TAB_TRIGGER}>
              {c.name} ({count(c.id)})
            </TabsTrigger>
          ))}
          <TabsTrigger value="tracked" className={TAB_TRIGGER}>
            Tracked{tracked ? ` (${tracked.size})` : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search vendors"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vendors or companies"
            value={search}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-56" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              All categories ({inView.length})
            </SelectItem>
            {categoryCounts.map(([name, n]) => (
              <SelectItem key={name} value={name}>
                {name} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-40" aria-label="Filter by grade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              All grades ({inCategory.length})
            </SelectItem>
            {GRADE_SCALE.map((g) => (
              <SelectItem key={g.grade} value={g.grade}>
                Grade {g.grade} ({gradeCount(g.grade)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => setSort(v as keyof typeof SORTS)}
        >
          <SelectTrigger className="w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([key, s]) => (
              <SelectItem key={key} value={key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <Checkbox
            aria-label="Select all untracked vendors"
            checked={allSelected}
            disabled={!tracked || untrackedVisible.length === 0}
            onCheckedChange={(on) =>
              setSelected(
                on ? new Set(untrackedVisible.map((c) => c.slug)) : new Set(),
              )
            }
          />
          <Button
            size="sm"
            disabled={pending || selected.size === 0}
            onClick={trackSelected}
          >
            Track selected ({selected.size})
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {inView.length} vendors
      </p>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {view === "tracked" && inView.length === 0
              ? "You are not tracking any vendors yet. Click Track on a vendor to add it here."
              : "No vendors match these filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map((c) => {
            const href = `/${tenant}/admin/trust-dossier/${c.slug}`;
            const isTracked = tracked?.has(c.slug) ?? false;
            return (
              <Card key={c.slug} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={`Select ${c.name}`}
                      className={cn("mt-1", isTracked && "invisible")}
                      checked={selected.has(c.slug)}
                      disabled={!tracked}
                      onCheckedChange={(on) =>
                        toggleSelected(c.slug, on === true)
                      }
                    />
                    <Avatar className="h-8 w-8 rounded-md border bg-white">
                      <AvatarImage alt="" src={c.logoUrl} />
                      <AvatarFallback className="rounded-md text-xs">
                        {c.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={href}
                        className="flex items-center gap-1.5 text-sm font-semibold hover:underline"
                      >
                        <span className="truncate">{c.name}</span>
                        {c.hasRedFlags && (
                          <AlertTriangle
                            aria-label="Has red flags"
                            className="h-3.5 w-3.5 shrink-0 text-destructive"
                          />
                        )}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.company ?? c.domains}
                      </p>
                    </div>
                    <Badge variant="outline" className={GRADE_CLASSES[c.grade]}>
                      {c.grade}
                    </Badge>
                  </div>
                  <Link
                    href={href}
                    className="line-clamp-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {c.summary}
                  </Link>
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <Badge
                      variant="secondary"
                      className="max-w-[45%] truncate font-normal"
                    >
                      {c.category}
                    </Badge>
                    <span className="text-sm font-medium">{c.score}/100</span>
                    <div className="ml-auto">
                      {tracked && (
                        <TrackButton
                          key={`${c.slug}-${isTracked}`}
                          tenant={tenant}
                          vendorSlug={c.slug}
                          vendorName={c.name}
                          initialTracked={isTracked}
                          onChange={(t) => setOne(c.slug, t)}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
