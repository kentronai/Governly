"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordAgentDiscoveryExport } from "@/lib/actions/agent-discovery-reports";

type ExportSnapshot = {
  cards: Record<string, number>;
  autonomy: { level: string; count: number }[];
  platforms: { label: string; count: number }[];
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportExports({
  tenant,
  snapshot,
}: {
  tenant: string;
  snapshot: ExportSnapshot;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const exportReport = async (format: "pdf" | "csv" | "xlsx") => {
    setBusy(format);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const rows = [
        ...Object.entries(snapshot.cards).map(([metric, value]) => ({
          section: "KPI",
          metric,
          value,
        })),
        ...snapshot.autonomy.map((x) => ({
          section: "Autonomy",
          metric: x.level,
          value: x.count,
        })),
        ...snapshot.platforms.map((x) => ({
          section: "Platform",
          metric: x.label,
          value: x.count,
        })),
      ];
      if (format === "csv") {
        const csv = [
          "Section,Metric,Value",
          ...rows.map((r) => `${r.section},${r.metric},${r.value}`),
        ].join("\n");
        downloadBlob(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
          `agent-registry-${date}.csv`,
        );
      } else if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.json_to_sheet(rows),
          "Executive Summary",
        );
        XLSX.writeFile(book, `agent-registry-${date}.xlsx`);
      } else {
        const { PdfUtils } = await import("@/lib/utils/pdfUtils");
        const report = document.createElement("div");
        report.style.cssText =
          "font:14px Arial;padding:24px;color:#111;background:#fff";
        report.innerHTML = `<h1>Agent Registry Executive Report</h1><p>Generated ${new Date().toLocaleString()}</p><table style="border-collapse:collapse;width:100%;margin-top:24px"><thead><tr><th style="border:1px solid #ddd;padding:10px;text-align:left">Section</th><th style="border:1px solid #ddd;padding:10px;text-align:left">Metric</th><th style="border:1px solid #ddd;padding:10px;text-align:left">Value</th></tr></thead><tbody>${rows.map((r) => `<tr><td style="border:1px solid #ddd;padding:10px">${r.section}</td><td style="border:1px solid #ddd;padding:10px">${r.metric}</td><td style="border:1px solid #ddd;padding:10px">${r.value}</td></tr>`).join("")}</tbody></table>`;
        await PdfUtils.generatePdf(report, {
          filename: `agent-registry-${date}.pdf`,
          pageSize: "a4",
        });
      }
      await recordAgentDiscoveryExport(tenant, format, snapshot);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {(["pdf", "csv", "xlsx"] as const).map((format) => (
        <Button
          key={format}
          variant="outline"
          size="sm"
          onClick={() => exportReport(format)}
          disabled={busy !== null}
        >
          {busy === format ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {format === "xlsx" ? "Excel" : format.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
