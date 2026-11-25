"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { errorToast } from "@/lib/utils/toast";
import {
  countRiskCatalog,
  searchRiskCatalog,
} from "@/lib/actions/risk-links";

export type CatalogSource = "ibm" | "mit";
export type CatalogRisk = Awaited<ReturnType<typeof searchRiskCatalog>>["rows"][number];

export const CATALOG_SOURCES: Record<
  CatalogSource,
  { title: string; license: string; url: string }
> = {
  ibm: {
    title: "IBM AI Risk Atlas",
    license: "Apache-2.0",
    url: "https://www.ibm.com/docs/en/watsonx/saas?topic=ai-risk-atlas",
  },
  mit: {
    title: "MIT AI Risk Repository",
    license: "CC BY 4.0",
    url: "https://airisk.mit.edu",
  },
};

/** MIT descriptions are verbatim quotes from papers; drop the wrapping quote marks for display. */
const clean = (s: string | null) => (s ?? "").trim().replace(/^["“]+|["”]+$/g, "");

export function RiskCatalogPicker({
  source,
  onClose,
  onPick,
}: {
  source: CatalogSource | null;
  onClose: () => void;
  onPick: (risk: CatalogRisk) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CatalogRisk[]>([]);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!source) return;
    setQuery("");
    setSelected("");
    countRiskCatalog(source).then(setTotal).catch(() => setTotal(0));
  }, [source]);

  useEffect(() => {
    if (!source) return;
    setLoading(true);
    let stale = false;
    const t = setTimeout(() => {
      searchRiskCatalog(source, query, 0)
        .then((r) => {
          if (stale) return;
          setRows(r.rows);
          setMatches(r.total);
          scroller.current?.scrollTo({ top: 0 });
        })
        .catch(() => errorToast("Unable to load the risk database"))
        .finally(() => !stale && setLoading(false));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [source, query]);

  // Load the next page when the end of the list scrolls into view.
  const loadMore = useCallback(async () => {
    if (!source || loading || loadingMore || rows.length >= matches) return;
    setLoadingMore(true);
    try {
      const r = await searchRiskCatalog(source, query, rows.length);
      setRows((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.rows.filter((x) => !seen.has(x.id))];
      });
      setMatches(r.total);
    } catch {
      errorToast("Unable to load more risks");
    } finally {
      setLoadingMore(false);
    }
  }, [source, query, rows, matches, loading, loadingMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void loadMore(), {
      root: scroller.current,
      rootMargin: "200px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, rows.length]);

  const meta = source ? CATALOG_SOURCES[source] : null;
  const picked = rows.find((r) => r.id === selected);

  return (
    <Dialog open={Boolean(source)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add a risk from {meta?.title}</DialogTitle>
          <DialogDescription>
            {total} risks from the{" "}
            <a href={meta?.url} target="_blank" rel="noopener noreferrer" className="underline">
              {meta?.title}
            </a>{" "}
            ({meta?.license}). Pick one, then review and save it.
          </DialogDescription>
        </DialogHeader>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by number, name, category, or description..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <RadioGroup value={selected} onValueChange={setSelected}>
            <Table className="table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-14">#</TableHead>
                  <TableHead className="w-[26%]">Risk name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[105px]">Severity</TableHead>
                  <TableHead className="w-[100px]">Likelihood</TableHead>
                  <TableHead className="w-[72px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No matching risks
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const description = clean(r.description);
                    const categories = (r.category ?? []).filter(Boolean);
                    return (
                      <TableRow
                        key={r.id}
                        onClick={() => setSelected(r.id)}
                        className={cn("cursor-pointer", selected === r.id && "bg-muted")}
                      >
                        <TableCell>
                          <RadioGroupItem value={r.id} aria-label={r.riskName} />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{r.catalogNo}</TableCell>
                        <TableCell className="truncate font-medium" title={r.riskName}>
                          {r.riskName}
                        </TableCell>
                        <TableCell className="truncate text-muted-foreground" title={description}>
                          {description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.severity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.likelihood}</Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Details of ${r.riskName}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 space-y-3 text-sm">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Category</p>
                                {categories.length ? (
                                  <ul className="mt-1 space-y-1">
                                    {categories.map((c) => (
                                      <li key={c}>{c}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="mt-1 text-muted-foreground">
                                    Not classified by the {meta?.title}
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Source reference</p>
                                <p className="mt-1 font-mono text-xs">{r.sourceId}</p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </RadioGroup>
          <div ref={sentinel} className="flex h-10 items-center justify-center text-xs text-muted-foreground">
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : rows.length >= matches && rows.length > 0 ? (
              `All ${matches.toLocaleString()} shown`
            ) : null}
          </div>
        </div>
        {picked && (
          <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              <span className="text-muted-foreground">#{picked.catalogNo}</span> {picked.riskName}
            </p>
            <p className="mt-1 text-muted-foreground">{clean(picked.description) || "No description in the source."}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Showing {rows.length.toLocaleString()} of {matches.toLocaleString()}
          {query.trim() ? " matches" : " risks"}. Scroll for more.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked} onClick={() => picked && onPick({ ...picked, description: clean(picked.description) })}>
            Use selected risk and edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
