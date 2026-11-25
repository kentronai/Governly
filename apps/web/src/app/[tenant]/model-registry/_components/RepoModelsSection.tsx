"use client";

import { useState, useTransition } from "react";
import { Check, Eye, GitBranch, RefreshCw, X } from "lucide-react";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { providerLabel } from "./labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalTime } from "@/components/common/LocalTime";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import { errorToast, successToast } from "@/lib/utils/toast";
import {
  approveRepoModel,
  dismissRepoModel,
  scanRepoModels,
  type RepoModelRow,
} from "@/lib/actions/repo-models";

/** Models found in connected GitHub repos: unapproved ones need Approve / Dismiss. */
export function RepoModelsSection({ tenant, rows }: { tenant: string; rows: RepoModelRow[] }) {
  const [pending, start] = useTransition();
  const [view, setView] = useState<RepoModelRow | null>(null);
  const unapproved = rows.filter((r) => !r.approved && !r.dismissed);
  const approved = rows.filter((r) => r.approved);

  const run = (fn: () => Promise<{ status?: boolean; message?: string } | undefined>, label: string) =>
    start(async () => {
      try {
        const res = await fn();
        if (res && res.status === false) errorToast(res.message);
        else successToast(res, "Model", label, res?.message);
      } catch (e) {
        errorToast(e);
      }
    });

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Models found in repos
          </CardTitle>
          <CardDescription>
            Models referenced in connected GitHub repositories. {unapproved.length} unapproved,{" "}
            {approved.length} approved in use.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => scanRepoModels(tenant), "scanned")}>
          <RefreshCw className="mr-2 h-4 w-4" /> Scan repos
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scans yet. Connect GitHub under Integrations, then run Scan repos (agent discovery also scans).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Found in</TableHead>
                <TableHead>Last detected</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...unapproved, ...approved].map((r) => {
                const files = new Set(r.locations.map((l) => `${l.repo}/${l.filePath}`)).size;
                return (
                  <TableRow key={r.modelId}>
                    <TableCell className="font-mono text-xs">{r.modelId}</TableCell>
                    <TableCell>{providerLabel(r.provider)}</TableCell>
                    <TableCell>
                      {r.approved ? <Badge variant="secondary">Approved</Badge> : <Badge variant="destructive">Unapproved</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.repos.length === 1 ? r.repos[0] : `${r.repos.length} repos`}
                      <span className="text-muted-foreground"> · {files} file{files === 1 ? "" : "s"}</span>
                    </TableCell>
                    <TableCell><LocalTime value={r.lastDetectedAt} /></TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu
                        label={`Actions for ${r.modelId}`}
                        items={[
                          { label: "View", icon: Eye, onSelect: () => setView(r) },
                          {
                            label: "Approve",
                            icon: Check,
                            hidden: r.approved,
                            disabled: pending,
                            onSelect: () => run(() => approveRepoModel(tenant, r.modelId, r.provider), "approved"),
                          },
                          {
                            label: "Dismiss",
                            icon: X,
                            hidden: r.approved,
                            disabled: pending,
                            destructive: true,
                            confirm: `Hide ${r.modelId} from this list? It reappears only if it shows up in a new file.`,
                            onSelect: () => run(() => dismissRepoModel(tenant, r.modelId), "dismissed"),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{view?.modelId}</DialogTitle>
          </DialogHeader>
          {view && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Provider guess: {view.provider} · {view.approved ? "Approved" : "Unapproved"} · used in {view.repos.length} repo(s)
              </p>
              <ul className="max-h-64 space-y-1 overflow-auto font-mono text-xs">
                {view.locations.map((l) => (
                  <li key={l.id}>{l.repo}/{l.filePath}{l.line ? `:${l.line}` : ""}</li>
                ))}
              </ul>
              <RecordMetadata createdBy={view.createdBy} createdAt={view.createdAt} updatedBy={view.updatedBy} updatedAt={view.updatedAt} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
