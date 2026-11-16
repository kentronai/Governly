"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
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
export type CatalogRisk = Awaited<ReturnType<typeof searchRiskCatalog>>[number];

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
  const [loading, setLoading] = useState(false);
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
    const t = setTimeout(() => {
      searchRiskCatalog(source, query)
        .then(setRows)
        .catch(() => errorToast("Unable to load the risk database"))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [source, query]);

  const meta = source ? CATALOG_SOURCES[source] : null;
  const picked = rows.find((r) => r.id === selected);

  return (
    <Dialog open={Boolean(source)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add a risk from {meta?.title}</DialogTitle>
          <DialogDescription>
            {total} risks from the{" "}
            <a href={meta?.url} target="_blank" rel="noreferrer" className="underline">
              {meta?.title}
            </a>{" "}
            ({meta?.license}). Pick one, then review and save it.
          </DialogDescription>
        </DialogHeader>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, category, or description..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <RadioGroup value={selected} onValueChange={setSelected}>
            <Table className="table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-[110px]">ID</TableHead>
                  <TableHead className="w-[22%]">Risk name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[105px]">Severity</TableHead>
                  <TableHead className="w-[100px]">Likelihood</TableHead>
                  <TableHead className="w-[20%]">Category</TableHead>
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
                    const category = r.category?.filter(Boolean).join("; ") || "—";
                    return (
                      <TableRow
                        key={r.id}
                        onClick={() => setSelected(r.id)}
                        className={cn("cursor-pointer", selected === r.id && "bg-muted")}
                      >
                        <TableCell>
                          <RadioGroupItem value={r.id} aria-label={r.riskName} />
                        </TableCell>
                        <TableCell className="truncate font-mono text-xs text-muted-foreground" title={r.sourceId ?? ""}>
                          {r.sourceId}
                        </TableCell>
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
                        <TableCell className="truncate" title={category}>
                          {category}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </RadioGroup>
        </div>
        {picked && (
          <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {picked.riskName}{" "}
              <span className="font-mono text-xs text-muted-foreground">{picked.sourceId}</span>
            </p>
            <p className="mt-1 text-muted-foreground">{clean(picked.description) || "No description in the source."}</p>
          </div>
        )}
        {rows.length === 200 && (
          <p className="text-xs text-muted-foreground">
            Showing the first 200 matches. Search to narrow the list.
          </p>
        )}

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
