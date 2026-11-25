"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorToast, successToast } from "@/lib/utils/toast";
import { generateTrustCenterReport, getTrustCenterAccess } from "@/lib/actions/trust-center";
import {
  fmtDate,
  lastFullQuarter,
  quarterRange,
  REPORT_SECTIONS,
  type ReportSectionKey,
} from "@/lib/trust-center/report";

export function downloadPdf(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The last four completed quarters, newest first. */
function recentQuarters() {
  const last = lastFullQuarter();
  return Array.from({ length: 4 }, (_, i) => {
    const n = last.year * 4 + (last.q - 1) - i;
    const year = Math.floor(n / 4);
    const q = (n % 4) + 1;
    const r = quarterRange(year, q);
    return { value: `${year}-Q${q}`, label: `Q${q} ${year} (${fmtDate(r.start, "short")} to ${fmtDate(r.end, "short")})`, ...r };
  });
}

/**
 * "Generate AI Trust Center Report" button + dialog. Renders nothing for non-admins;
 * the server action enforces admin as well.
 */
export function GenerateTrustCenterReport({
  tenantSlug,
  onGenerated,
  variant = "default",
}: {
  tenantSlug: string;
  onGenerated?: () => void;
  variant?: "default" | "outline";
}) {
  const quarters = useMemo(recentQuarters, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(quarters[0].value);
  const [custom, setCustom] = useState({ start: quarters[0].start, end: quarters[0].end });
  const [sections, setSections] = useState<ReportSectionKey[]>(REPORT_SECTIONS.map((s) => s.key));
  const [watermark, setWatermark] = useState(true);
  const [includePrevious, setIncludePrevious] = useState(false);

  useEffect(() => {
    if (!tenantSlug) return;
    getTrustCenterAccess(tenantSlug)
      .then((r) => setIsAdmin(r.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [tenantSlug]);

  if (!isAdmin) return null;

  const range = period === "custom" ? custom : quarters.find((q) => q.value === period)!;
  const valid = sections.length > 0 && range.start && range.end && range.start <= range.end;

  const generate = async () => {
    setBusy(true);
    try {
      const r = await generateTrustCenterReport(tenantSlug, {
        periodStart: range.start,
        periodEnd: range.end,
        sections,
        watermark,
        includePreviousSubprocessors: includePrevious,
      });
      downloadPdf(r.filename, r.base64);
      successToast(null, "Report", "generated", `Report ${r.reportId} generated`);
      setOpen(false);
      onGenerated?.();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" />
        Generate AI Trust Center Report
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate AI Trust Center Report</DialogTitle>
            <DialogDescription>
              A PDF built from your current live data. Download links expire after 7 days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="tc-period">Reporting period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger id="tc-period" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {quarters.map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {period === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="tc-start">From</Label>
                    <Input id="tc-start" type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tc-end">To</Label>
                    <Input id="tc-end" type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Sections</legend>
              {REPORT_SECTIONS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`tc-${s.key}`}
                    checked={sections.includes(s.key)}
                    onCheckedChange={(c) =>
                      setSections((prev) =>
                        c ? REPORT_SECTIONS.map((x) => x.key).filter((k) => k === s.key || prev.includes(k)) : prev.filter((k) => k !== s.key),
                      )
                    }
                  />
                  <Label htmlFor={`tc-${s.key}`} className="font-normal">
                    {i + 1}. {s.title}
                  </Label>
                </div>
              ))}
            </fieldset>

            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="tc-watermark" className="font-normal">
                &quot;Confidential&quot; watermark
              </Label>
              <Switch id="tc-watermark" checked={watermark} onCheckedChange={setWatermark} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="tc-previous" checked={includePrevious} onCheckedChange={(c) => setIncludePrevious(c === true)} />
              <Label htmlFor="tc-previous" className="font-normal">
                Include previously used sub-processors
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={generate} disabled={!valid || busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
