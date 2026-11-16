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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Risk name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Likelihood</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No matching risks
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className={cn("cursor-pointer", selected === r.id && "bg-muted")}
                    >
                      <TableCell>
                        <RadioGroupItem value={r.id} aria-label={r.riskName} />
                      </TableCell>
                      <TableCell className="max-w-[220px] font-medium">{r.riskName}</TableCell>
                      <TableCell className="max-w-[320px]">
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {r.description}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.likelihood}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="line-clamp-2 text-sm">
                          {r.category?.filter(Boolean).join("; ")}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </RadioGroup>
        </div>
        {rows.length === 200 && (
          <p className="text-xs text-muted-foreground">
            Showing the first 200 matches. Search to narrow the list.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked} onClick={() => picked && onPick(picked)}>
            Use selected risk and edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
