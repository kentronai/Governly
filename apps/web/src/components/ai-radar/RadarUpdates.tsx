"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRadarUpdates } from "@/lib/actions/ai-radar";
import { errorToast } from "@/lib/utils/toast";

type Update = Awaited<ReturnType<typeof getRadarUpdates>>[number];

const label = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ");

/** Changes the agent detected and applied, each with its primary source. */
export function RadarUpdates({ refreshKey }: { refreshKey?: number }) {
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [selected, setSelected] = useState<Update | null>(null);

  useEffect(() => {
    getRadarUpdates().then(setUpdates).catch((e) => {
      errorToast(e);
      setUpdates([]);
    });
  }, [refreshKey]);

  if (!updates)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!updates.length)
    return (
      <div className="py-8 text-center">
        <p>No updates yet</p>
        <p className="text-sm text-muted-foreground">
          The first run records a baseline of each source; updates appear when a source changes.
        </p>
      </div>
    );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Detected</TableHead>
            <TableHead>Jurisdiction</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {updates.map((u) => (
            <TableRow key={u.id} className="cursor-pointer" onClick={() => setSelected(u)}>
              <TableCell className="whitespace-nowrap">{format(new Date(u.detectedAt), "MMM dd, yyyy")}</TableCell>
              <TableCell>{u.jurisdiction}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{u.title}</span>
                  <Badge variant="outline" className="w-fit">{label(u.changeType)}</Badge>
                </div>
              </TableCell>
              <TableCell className="max-w-[360px] truncate">{u.summary}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                  <a href={u.sourceUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    {new URL(u.sourceUrl).hostname}
                  </a>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  {selected.jurisdiction} · {label(selected.changeType)} ·{" "}
                  {format(new Date(selected.detectedAt), "MMM dd, yyyy")}
                </p>
                <p>{selected.summary}</p>
                <div>
                  <h3 className="mb-1 font-medium">Applied to the platform</h3>
                  <ul className="space-y-1">
                    {Object.entries(selected.changes as Record<string, { from: unknown; to: unknown }>).map(
                      ([field, c]) => (
                        <li key={field}>
                          <span className="font-medium">{label(field.replace(/([A-Z])/g, "_$1").toLowerCase())}:</span>{" "}
                          {c.from != null && <span className="text-muted-foreground line-through">{String(c.from)} </span>}
                          {String(c.to)}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 font-medium">Source evidence</h3>
                  <blockquote className="border-l-2 pl-3 italic text-muted-foreground">
                    “{selected.sourceQuote}”
                  </blockquote>
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-blue-500 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {selected.sourceUrl}
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
