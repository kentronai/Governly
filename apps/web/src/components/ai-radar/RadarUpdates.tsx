"use client";

import { useEffect, useState } from "react";
import { differenceInDays, format } from "date-fns";
import { ExternalLink, Info, Loader2, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/common/pagination";
import { getRadarUpdates, type RadarUpdateFilters } from "@/lib/actions/ai-radar";
import { instrumentKind, shortSummary } from "@/lib/radar-categories";
import { errorToast } from "@/lib/utils/toast";

type Page = Awaited<ReturnType<typeof getRadarUpdates>>;
type Update = Page["data"][number];

const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ");
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * The latest AI regulations and policies AI Radar found in official feeds, newest
 * publication first. The page filters narrow it; View shows the complete policy
 * record with its official source link and the exact passage it was verified against.
 */
export function RadarUpdates({
  filters,
  refreshKey,
}: {
  filters: Omit<RadarUpdateFilters, "page" | "pageSize">;
  refreshKey?: number;
}) {
  const [result, setResult] = useState<Page | null>(null);
  const [selected, setSelected] = useState<Update | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { region, country, category, search } = filters;
  // New selection -> back to the first page.
  useEffect(() => setPage(1), [region, country, category, search]);

  useEffect(() => {
    let live = true;
    setResult(null);
    getRadarUpdates({ region, country, category, search, page, pageSize })
      .then((r) => live && setResult(r))
      .catch((e) => {
        errorToast(e);
        live && setResult({ data: [], total: 0, totalPages: 1 });
      });
    return () => {
      live = false;
    };
  }, [region, country, category, search, page, pageSize, refreshKey]);

  const filtered = !!(region || country || category || search);

  return (
    <>
      {!result ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading…</span>
        </div>
      ) : !result.data.length ? (
        <div className="py-12 text-center">
          <p>{filtered ? "Nothing new for this selection" : "No updates yet"}</p>
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "Try another region, country or topic. AI Radar re-checks every 3 days."
              : "New regulations and policies appear here as soon as AI Radar finds them."}
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Policy / regulation</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="min-w-[240px] max-w-[320px] whitespace-normal break-words align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        {u.title}
                        {differenceInDays(new Date(), new Date(u.detectedAt)) < 7 && (
                          <Badge className="ml-2 bg-blue-500/10 text-blue-500">New</Badge>
                        )}
                      </span>
                      {u.category && (
                        <Badge variant="outline" className="w-fit">
                          {u.category}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline" className="whitespace-nowrap">
                      {instrumentKind(u)}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col">
                      <span>{u.jurisdiction}</span>
                      {u.region && <span className="text-xs text-muted-foreground">{u.region}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[280px] max-w-[420px] whitespace-normal break-words align-top">
                    <p className="text-sm text-muted-foreground">{shortSummary(u.summary)}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top">
                    {format(new Date(u.publishedDate ?? u.detectedAt), "MMM dd, yyyy")}
                  </TableCell>
                  <TableCell className="align-top">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-transparent">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[152px]">
                        <DropdownMenuItem
                          onClick={() => setSelected(u)}
                          className="flex cursor-pointer items-center gap-2 text-sm font-normal"
                        >
                          <Info size={15} />
                          View
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-6">
            <Pagination
              page={page}
              setPage={setPage}
              totalPages={result.totalPages}
              pageSize={pageSize}
              setPageSize={setPageSize}
            />
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {instrumentKind(selected)} ·{" "}
                    {instrumentKind(selected) === "Regulation" ? "mandatory" : "voluntary"}
                  </Badge>
                  {selected.instrumentType && <Badge variant="outline">{selected.instrumentType}</Badge>}
                  {selected.status && <Badge variant="outline">{label(selected.status)}</Badge>}
                  {selected.category && <Badge variant="outline">{selected.category}</Badge>}
                  <Badge variant="outline">{label(selected.changeType)}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  {[
                    ["Jurisdiction", [selected.jurisdiction, selected.region].filter(Boolean).join(" · ")],
                    ["Published", selected.publishedDate && format(new Date(selected.publishedDate), "MMM dd, yyyy")],
                    [
                      "Effective",
                      (selected.effectiveDate ?? selected.policyEffectiveDate) &&
                        format(new Date((selected.effectiveDate ?? selected.policyEffectiveDate)!), "MMM dd, yyyy"),
                    ],
                    ["Detected", format(new Date(selected.detectedAt), "MMM dd, yyyy")],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-medium">{v}</dd>
                      </div>
                    ))}
                </dl>
                {[
                  ["Description", selected.policySummary ?? selected.summary],
                  ["Who is affected", selected.whoIsAffected],
                  ["Compliance requirements", selected.complianceRequirements],
                  ["Enforcement", selected.enforcementDetails],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <h3 className="mb-1 font-medium">{k}</h3>
                      <p className="whitespace-pre-line text-muted-foreground">{v}</p>
                    </div>
                  ))}
                <div>
                  <h3 className="mb-1 font-medium">Source evidence</h3>
                  <blockquote className="border-l-2 pl-3 italic text-muted-foreground">
                    “{selected.sourceQuote}”
                  </blockquote>
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 break-all text-blue-500 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {host(selected.sourceUrl)} — open official source
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
