"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
                <TableHead className="text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => {
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
                        <Switch
                          aria-label={`Share ${r.reportId} with viewers`}
                          checked={r.shared}
                          onCheckedChange={(c) => toggleShared(r, c)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" disabled={expired} onClick={() => download(r)} aria-label={`Download ${r.reportId}`}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
