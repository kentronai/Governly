"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Eye, Share2 } from "lucide-react";
import { RecordViewDialog } from "@/components/common/RecordViewDialog";
import Pagination from "@/components/common/pagination";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorToast } from "@/lib/utils/toast";
import {
  downloadTrustCenterReport,
  listTrustCenterReports,
  setTrustCenterReportShared,
} from "@/lib/actions/trust-center";
import { fmtDate } from "@/lib/trust-center/report";
import { downloadPdf, GenerateTrustCenterReport } from "./GenerateTrustCenterReport";

type Report = Awaited<ReturnType<typeof listTrustCenterReports>>["reports"][number];

/** Recent reports. Admins see all and can share; members see shared ones only. */
export function TrustCenterReports({ tenantSlug }: { tenantSlug: string }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Report | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(() => {
    listTrustCenterReports(tenantSlug)
      .then((r) => {
        setReports(r.reports);
        setIsAdmin(r.isAdmin);
      })
      .catch(errorToast)
      .finally(() => setLoading(false));
  }, [tenantSlug]);
  useEffect(load, [load]);

  const toggleShared = async (r: Report, shared: boolean) => {
    try {
      await setTrustCenterReportShared(tenantSlug, r.reportId, shared);
      setReports((prev) => prev.map((x) => (x.reportId === r.reportId ? { ...x, shared } : x)));
    } catch (e) {
      errorToast(e instanceof Error ? e.message : e);
    }
  };
  const download = async (r: Report) => {
    try {
      const f = await downloadTrustCenterReport(tenantSlug, r.reportId);
      downloadPdf(f.filename, f.base64);
    } catch (e) {
      errorToast(e instanceof Error ? e.message : e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trust Center reports</CardTitle>
        <CardDescription>
          {isAdmin
            ? "Reports generated in the last weeks. Share a report to let viewers download it. Links expire 7 days after generation."
            : "Reports an administrator has shared with you. Links expire 7 days after generation."}
        </CardDescription>
        <CardAction>
          <GenerateTrustCenterReport tenantSlug={tenantSlug} onGenerated={load} variant="outline" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !reports.length ? (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Report ID</TableHead>
                <TableHead>Reporting period</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Link expires</TableHead>
                {isAdmin && <TableHead>Shared</TableHead>}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.slice((page - 1) * pageSize, page * pageSize).map((r) => {
                const expired = new Date(r.expiresAt) < new Date();
                return (
                  <TableRow key={r.reportId}>
                    <TableCell className="font-mono text-xs">{r.reportId}</TableCell>
                    <TableCell>
                      {fmtDate(r.periodStart, "short")} to {fmtDate(r.periodEnd, "short")}
                    </TableCell>
                    <TableCell>
                      {fmtDate(r.createdAt, "short")}
                      {r.generatedByEmail && <div className="text-xs text-muted-foreground">{r.generatedByEmail}</div>}
                    </TableCell>
                    <TableCell>{expired ? <Badge variant="secondary">Expired</Badge> : fmtDate(r.expiresAt, "short")}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Badge variant={r.shared ? "default" : "secondary"}>{r.shared ? "Shared" : "Private"}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <RowActionsMenu
                        label={`Actions for ${r.reportId}`}
                        items={[
                          { label: "View", icon: Eye, onSelect: () => setViewing(r) },
                          { label: "Download PDF", icon: Download, disabled: expired, onSelect: () => download(r) },
                          {
                            label: r.shared ? "Stop sharing with viewers" : "Share with viewers",
                            icon: Share2,
                            hidden: !isAdmin,
                            onSelect: () => toggleShared(r, !r.shared),
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
        {reports.length > pageSize && (
          <Pagination page={page} setPage={setPage} totalPages={Math.ceil(reports.length / pageSize)} pageSize={pageSize} setPageSize={setPageSize} />
        )}
        <RecordViewDialog
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={viewing?.reportId}
          fields={
            viewing
              ? [
                  ["Period", `${fmtDate(viewing.periodStart, "short")} to ${fmtDate(viewing.periodEnd, "short")}`],
                  ["Expires", fmtDate(viewing.expiresAt, "short")],
                  ["Visibility", viewing.shared ? "Shared" : "Private"],
                ]
              : []
          }
          meta={viewing ? { createdBy: viewing.generatedByEmail, createdAt: viewing.createdAt } : undefined}
        />
      </CardContent>
    </Card>
  );
}
