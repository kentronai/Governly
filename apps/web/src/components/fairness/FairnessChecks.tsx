"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileUp, Loader2, Plus, Scale, Trash2 } from "lucide-react";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { PageHeader } from "@/components/common/PageHeader";
import { errorToast, successToast } from "@/lib/utils/toast";
import { getFormattedDateString } from "@/lib/utils/helpers";
import { cn } from "@/lib/utils";
import { computeFairness, FOUR_FIFTHS, type FairnessResult } from "@/lib/fairness";
import {
  deleteFairnessCheck,
  listApplicationFairnessChecks,
  listFairnessChecks,
  saveFairnessCheck,
} from "@/lib/actions/fairness-checks";

type Check = Awaited<ReturnType<typeof listFairnessChecks>>[number] & { riskName?: string };
type RiskOption = { id: string; riskName: string };
type Rows = Record<string, unknown>[];

const NONE = "__none__";
const MAX_ROWS = 200_000;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function ResultBadge({ passed }: { passed: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={passed ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}
    >
      {passed ? "Passes 4/5 rule" : "Below 0.8"}
    </Badge>
  );
}

function ResultTable({ result }: { result: FairnessResult }) {
  const withTpr = result.equalOpportunityDifference !== undefined;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Lowest impact ratio", result.minImpactRatio.toFixed(3)],
          ["Selection-rate gap", pct(result.demographicParityDifference)],
          [
            "Equal opportunity gap",
            withTpr ? pct(result.equalOpportunityDifference!) : "Needs a true-label column",
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Positive outcome</TableHead>
              <TableHead className="text-right">Selection rate</TableHead>
              <TableHead className="text-right">Impact ratio</TableHead>
              {withTpr && <TableHead className="text-right">True positive rate</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.groups.map((g) => (
              <TableRow key={g.group}>
                <TableCell className="font-medium">
                  {g.group}
                  {g.small && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      small group
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{g.n}</TableCell>
                <TableCell className="text-right tabular-nums">{g.selected}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(g.selectionRate)}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    g.impactRatio < FOUR_FIFTHS && "text-red-600",
                  )}
                >
                  {g.impactRatio.toFixed(3)}
                </TableCell>
                {withTpr && (
                  <TableCell className="text-right tabular-nums">
                    {g.truePositiveRate === undefined ? "—" : pct(g.truePositiveRate)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Impact ratio = a group&apos;s selection rate ÷ the highest group&apos;s rate. Below 0.8 fails
        the four-fifths rule (EEOC 29 CFR 1607.4(D), NYC LL 144). Groups under 30 people are marked
        small: their rates are unstable. {result.rows} rows used
        {result.skipped ? `, ${result.skipped} skipped for an empty group or decision` : ""}.
      </p>
    </div>
  );
}

function ColumnSelect({
  id,
  label,
  value,
  options,
  onChange,
  optional,
  labels,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  /** Display text per option value (defaults to the value). */
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
        {!optional && <span className="text-red-500">*</span>}
      </Label>
      <Select value={value || (optional ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger id={id} className="h-9 w-full">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {labels?.[o] ?? o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewCheckDialog({
  riskId,
  risks,
  open,
  onClose,
  onSaved,
}: {
  /** Fixed risk (risk detail page); otherwise the user picks one of `risks`. */
  riskId?: string;
  risks: RiskOption[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [targetRisk, setTargetRisk] = useState(riskId ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Rows>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [groupColumn, setGroupColumn] = useState("");
  const [decisionColumn, setDecisionColumn] = useState("");
  const [positiveValue, setPositiveValue] = useState("");
  const [labelColumn, setLabelColumn] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setName("");
    setTargetRisk(riskId ?? "");
    setFileName("");
    setRows([]);
    setColumns([]);
    setGroupColumn("");
    setDecisionColumn("");
    setPositiveValue("");
    setLabelColumn("");
  }, [open, riskId]);

  const readFile = async (file: File) => {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!data.length) throw new Error("The file has no rows");
      if (data.length > MAX_ROWS) throw new Error(`Keep files under ${MAX_ROWS.toLocaleString()} rows`);
      setRows(data);
      setColumns(Object.keys(data[0]));
      setFileName(file.name);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) {
      errorToast(e?.message || "Could not read the file");
    } finally {
      setParsing(false);
    }
  };

  const decisionValues = useMemo(
    () =>
      decisionColumn
        ? [...new Set(rows.map((r) => String(r[decisionColumn] ?? "").trim()).filter(Boolean))].slice(0, 50)
        : [],
    [rows, decisionColumn],
  );

  const computed = useMemo(() => {
    if (!groupColumn || !decisionColumn || !positiveValue) return null;
    try {
      return {
        result: computeFairness({
          rows,
          groupColumn,
          decisionColumn,
          positiveValue,
          labelColumn: labelColumn || undefined,
        }),
      };
    } catch (e: any) {
      return { error: e?.message as string };
    }
  }, [rows, groupColumn, decisionColumn, positiveValue, labelColumn]);

  const save = async () => {
    if (!computed?.result) return;
    setSaving(true);
    try {
      await saveFairnessCheck({
        riskId: targetRisk,
        name,
        fileName,
        groupColumn,
        decisionColumn,
        positiveValue,
        labelColumn: labelColumn || undefined,
        result: computed.result,
      });
      successToast("", "", "", "Fairness check saved");
      onSaved();
      onClose();
    } catch {
      errorToast("Could not save the fairness check");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New fairness check</DialogTitle>
          <DialogDescription>
            Upload your model&apos;s decisions as CSV or Excel, one row per person. The file is read in
            your browser and is not uploaded; only the summary below is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fc-name" className="text-sm text-muted-foreground">
                Name<span className="text-red-500">*</span>
              </Label>
              <Input
                id="fc-name"
                className="h-9"
                placeholder="e.g. Hiring model Q4 by gender"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-file" className="text-sm text-muted-foreground">
                Decisions file<span className="text-red-500">*</span>
              </Label>
              <Input
                id="fc-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="h-9"
                onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
              />
            </div>
            {!riskId && (
              <div className="space-y-1.5 sm:col-span-2">
                <ColumnSelect
                  id="fc-risk"
                  label="Risk this check is evidence for"
                  value={targetRisk}
                  options={risks.map((r) => r.id)}
                  labels={Object.fromEntries(risks.map((r) => [r.id, r.riskName]))}
                  onChange={setTargetRisk}
                />
                {!risks.length && (
                  <p className="text-xs text-muted-foreground">
                    This application has no risks yet. You can still run the test; add a risk under
                    Risks to save it.
                  </p>
                )}
              </div>
            )}
          </div>

          {parsing && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}

          {columns.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {fileName}: {rows.length.toLocaleString()} rows, {columns.length} columns
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ColumnSelect id="fc-group" label="Group column (e.g. gender)" value={groupColumn} options={columns} onChange={setGroupColumn} />
                <ColumnSelect
                  id="fc-decision"
                  label="Decision column"
                  value={decisionColumn}
                  options={columns}
                  onChange={(v) => {
                    setDecisionColumn(v);
                    setPositiveValue("");
                  }}
                />
                <ColumnSelect id="fc-positive" label="Positive outcome value" value={positiveValue} options={decisionValues} onChange={setPositiveValue} />
                <ColumnSelect id="fc-label" label="True-label column" value={labelColumn} options={columns} onChange={setLabelColumn} optional />
              </div>
            </>
          )}

          {computed?.error && <p className="text-sm text-red-500">{computed.error}</p>}
          {computed?.result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">Result</h4>
                <ResultBadge passed={computed.result.passed} />
              </div>
              <ResultTable result={computed.result} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!computed?.result || !name.trim() || !targetRisk || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fairness (bias) checks: upload decisions, run the four-fifths test, save the summary.
 * Pass `riskId` for one risk, or `applicationId` for every risk in an application.
 */
export default function FairnessChecks({
  riskId,
  applicationId,
}: {
  riskId?: string;
  applicationId?: string;
}) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [risks, setRisks] = useState<RiskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Check | null>(null);
  const [deleting, setDeleting] = useState<Check | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (applicationId) {
        const data = await listApplicationFairnessChecks(applicationId);
        setChecks(data.checks);
        setRisks(data.risks);
      } else if (riskId) {
        setChecks(await listFairnessChecks(riskId));
      }
    } catch {
      errorToast("Could not load fairness checks");
    } finally {
      setLoading(false);
    }
  }, [riskId, applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteFairnessCheck(deleting.id);
      setDeleting(null);
      await load();
    } catch {
      errorToast("Could not delete the fairness check");
    }
  };

  const cols = applicationId ? 9 : 8;

  return (
    <div className="space-y-4">
      <PageHeader
        title={applicationId ? "Bias Monitoring" : "Bias & Fairness"}
        description="Upload a model's decisions to test whether every group gets a positive outcome at a similar rate."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New fairness check
          </Button>
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {applicationId && <TableHead>Risk</TableHead>}
            <TableHead>File</TableHead>
            <TableHead>Group column</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Lowest impact ratio</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={cols} className="py-10 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </TableCell>
            </TableRow>
          ) : !checks.length ? (
            <TableRow>
              <TableCell colSpan={cols} className="py-12 text-center text-sm text-muted-foreground">
                <Scale className="mx-auto mb-2 h-6 w-6" />
                No fairness checks yet. Upload your model&apos;s decisions to run one.
              </TableCell>
            </TableRow>
          ) : (
            checks.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                {applicationId && <TableCell>{c.riskName}</TableCell>}
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileUp className="h-3.5 w-3.5" />
                    {c.fileName}
                  </span>
                </TableCell>
                <TableCell>{c.groupColumn}</TableCell>
                <TableCell className="text-right tabular-nums">{c.result.rows}</TableCell>
                <TableCell className="text-right tabular-nums">{c.result.minImpactRatio.toFixed(3)}</TableCell>
                <TableCell>
                  <ResultBadge passed={c.passed} />
                </TableCell>
                <TableCell>{getFormattedDateString(c.createdAt)}</TableCell>
                <TableCell>
                  <RowActionsMenu
                    label={`Actions for ${c.name}`}
                    items={[
                      { label: "View", icon: Eye, onSelect: () => setViewing(c) },
                      { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleting(c) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <NewCheckDialog riskId={riskId} risks={risks} open={creating} onClose={() => setCreating(false)} onSaved={load} />

      <Dialog open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>
              {viewing &&
                `${viewing.fileName} · group: ${viewing.groupColumn} · decision: ${viewing.decisionColumn} = "${viewing.positiveValue}"${viewing.labelColumn ? ` · true label: ${viewing.labelColumn}` : ""}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && <ResultTable result={viewing.result} />}
          {viewing && <RecordMetadata createdBy={viewing.createdBy} createdAt={viewing.createdAt} />}
        </DialogContent>
      </Dialog>

      <DeleteConfirmationModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        isLoading={false}
        title="Delete this fairness check?"
        itemName={deleting?.name || ""}
        itemType="fairness check"
      />
    </div>
  );
}
