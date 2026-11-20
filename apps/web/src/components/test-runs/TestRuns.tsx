"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Eye, Info, Loader2, MoreHorizontal, Pause, Play, Plus, Shield, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { PageHeader } from "@/components/common/PageHeader";
import { ExpectedBadge } from "@/components/test-runs/Datasets";
import { ModelPicker, isSpecComplete, type SavedKey } from "@/components/test-runs/ModelPicker";
import { cn } from "@/lib/utils";
import { errorToast, successToast } from "@/lib/utils/toast";
import { getFormattedDateString } from "@/lib/utils/helpers";
import {
  DATASET_TEMPLATES,
  QUALITY_METRICS,
  metricLabel,
  summarize,
  trustBand,
  type DatasetItem,
  type ModelSpec,
} from "@/lib/test-runs";
import {
  createTestRun,
  deleteTestRun,
  getActiveGuardrails,
  listDatasets,
  listTestRuns,
  runTestRunItem,
} from "@/lib/actions/test-runs";
import { listLlmKeys } from "@/lib/actions/llm-keys";

type Run = Awaited<ReturnType<typeof listTestRuns>>[number];
type Guardrails = Awaited<ReturnType<typeof getActiveGuardrails>>;

const GUARDRAIL_INFO =
  "Checked by Governly's guardrails, no AI involved. Each prompt goes through this application's active guardrail policy, and we compare blocked/allowed with what the dataset expected.";
const QUALITY_INFO =
  "Checked by the Reviewer model you pick below. It reads every answer that was allowed through and grades each check from 1 to 5 with a one-line reason (1 = 0, 5 = 100). A check passes at 75 or higher.";

const fmt = (x: number | null | undefined) => (x === null || x === undefined ? "–" : `${Math.round(x)}`);

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Who checks this" className="text-muted-foreground hover:text-foreground">
          <Info className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  );
}

function TrustBadge({ score }: { score: number | null }) {
  const band = trustBand(score);
  return (
    <Badge
      variant="secondary"
      className={cn(
        band === "Strong" && "bg-green-500/10 text-green-600",
        band === "Fair" && "bg-amber-500/10 text-amber-600",
        band === "At Risk" && "bg-red-500/10 text-red-600",
      )}
    >
      {fmt(score)} · {band}
    </Badge>
  );
}

function Stat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {info && <InfoTip text={info} />}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

// ---------------- Wizard ----------------

const STEPS = ["Model", "Dataset", "Checks", "Start"];

function NewRunDialog({
  open,
  onOpenChange,
  applicationId,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  applicationId: string;
  onStarted: (runId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const { tenant } = useParams<{ tenant: string }>();
  const [saved, setSaved] = useState<SavedKey | null>(null);
  const [guardrails, setGuardrails] = useState<Guardrails | undefined>(undefined);
  const [datasets, setDatasets] = useState<{ id: string; name: string; items: DatasetItem[] }[]>([]);
  const [target, setTarget] = useState<ModelSpec | null>(null);
  const [datasetKey, setDatasetKey] = useState("");
  const [metrics, setMetrics] = useState<string[]>(QUALITY_METRICS.map((m) => m.key));
  const [reviewer, setReviewer] = useState<ModelSpec | null>(null);
  const [rules, setRules] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName("");
    setGuardrails(undefined);
    listLlmKeys(tenant).then((k) => setSaved(k[0] ?? null)).catch(() => setSaved(null));
    getActiveGuardrails(applicationId).then(setGuardrails).catch(() => setGuardrails(null));
    listDatasets(applicationId).then(setDatasets).catch(() => setDatasets([]));
  }, [open, applicationId, tenant]);

  const options = [
    ...datasets.map((d) => ({ key: `ds:${d.id}`, name: d.name, items: d.items, group: "Your datasets" })),
    ...DATASET_TEMPLATES.map((t) => ({ key: `tpl:${t.id}`, name: t.name, items: t.items, group: "Templates" })),
  ];
  const dataset = options.find((o) => o.key === datasetKey);
  const customRules = rules.split("\n").map((r) => r.trim()).filter(Boolean);
  const needsReviewer = metrics.length > 0 || customRules.length > 0;
  const canNext = [
    isSpecComplete(target, saved),
    !!dataset,
    !!guardrails && (!needsReviewer || isSpecComplete(reviewer, saved)),
    true,
  ][step];

  const start = async () => {
    if (!dataset || !target) return;
    setBusy(true);
    try {
      const res = await createTestRun({
        applicationId,
        name,
        datasetName: dataset.name,
        items: dataset.items,
        target,
        reviewer: needsReviewer && reviewer ? reviewer : undefined,
        metrics,
        customRules,
      });
      if (!res.ok) throw new Error(res.error);
      onOpenChange(false);
      onStarted(res.id);
    } catch (e: any) {
      errorToast(e?.message || "Could not start the test run");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New test run</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-xs",
                  i < step && "bg-primary text-primary-foreground border-primary",
                  i === step && "border-primary text-primary",
                )}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn(i !== step && "text-muted-foreground")}>{s}</span>
              {i < STEPS.length - 1 && <span className="w-6 border-t" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Pick the model to test. Prompts the guardrails allow are sent to it, and its answers are graded.
            </p>
            <ModelPicker idPrefix="target" value={target} onChange={setTarget} saved={saved} />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            <Label>Dataset</Label>
            <Select value={datasetKey} onValueChange={setDatasetKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select a dataset or template" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.name} <span className="text-muted-foreground">({o.group}, {o.items.length} prompts)</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Upload your own on the Datasets page.</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center gap-2 font-medium">
                Guardrail Checks <InfoTip text={GUARDRAIL_INFO} />
                <Badge variant="secondary">Always on</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Catch Rate, Leaks and False Alarm Rate.</p>
              {guardrails === undefined ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : guardrails === null ? (
                <p className="text-sm text-destructive">
                  This application has no active guardrail policy. Attach one under Policies, then come back.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Policy <span className="font-medium">{guardrails.policyName}</span> with{" "}
                    {guardrails.guards.length} guardrail{guardrails.guards.length === 1 ? "" : "s"} enabled:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {guardrails.guards.map((g) => (
                      <Badge key={g} variant="outline">{g}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-2 font-medium">
                AI Quality Checks <InfoTip text={QUALITY_INFO} />
              </div>
              <div className="space-y-2">
                <Label>Reviewer model (who checks)</Label>
                <p className="text-xs text-muted-foreground">Pick a different, stronger model than the one being tested.</p>
                <ModelPicker idPrefix="reviewer" value={reviewer} onChange={setReviewer} saved={saved} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {QUALITY_METRICS.map((m) => (
                  <label key={m.key} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={metrics.includes(m.key)}
                      onCheckedChange={(c) =>
                        setMetrics((prev) => (c ? [...prev, m.key] : prev.filter((k) => k !== m.key)))
                      }
                    />
                    <span>
                      <span className="font-medium">{m.label}</span>
                      <span className="block text-muted-foreground">{m.rubric}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="rules">Your own rules (optional, one per line, max 5)</Label>
                <Textarea
                  id="rules"
                  rows={3}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder={"Never promise a refund over $100.\nAlways offer to connect a human agent."}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && dataset && target && (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Stat label="Model" value={target.modelId} />
              <Stat label="Dataset" value={`${dataset.items.length} prompts`} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-name">Test run name</Label>
              <Input
                id="run-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${target.modelId} × ${dataset.name}`}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Estimated time: about {Math.max(1, Math.ceil((dataset.items.length * (needsReviewer ? 8 : 4)) / 60))}{" "}
              min. Keep this page open while it runs.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => (step ? setStep(step - 1) : onOpenChange(false))}>
            {step ? "Back" : "Cancel"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next
            </Button>
          ) : (
            <Button disabled={busy} onClick={start}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Start test run
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Results ----------------

function ResultsDialog({ run, onClose }: { run: Run | null; onClose: () => void }) {
  if (!run) return null;
  const s = summarize(run.results);
  const keys = run.config.metrics;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{run.name}</DialogTitle>
          <DialogDescription>
            {run.datasetName} · model {run.config.target.label}
            {run.config.policyName && ` · policy ${run.config.policyName}`}
            {run.config.reviewer && ` · reviewed by ${run.config.reviewer.label}`} ·{" "}
            {s.passed}/{run.items.length} prompts passed
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">Trust Score</span>
            <TrustBadge score={s.trustScore} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-medium">
              Guardrail Checks <InfoTip text={GUARDRAIL_INFO} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Catch Rate" value={s.catchRate === null ? "–" : `${fmt(s.catchRate)}%`} info="Should-block prompts that were blocked." />
              <Stat label="Leaks" value={String(s.leaks)} info="Should-block prompts that got through." />
              <Stat label="False Alarm Rate" value={s.falseAlarmRate === null ? "–" : `${fmt(s.falseAlarmRate)}%`} info="Should-allow prompts that were wrongly blocked." />
            </div>
          </div>

          {keys.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-medium">
                AI Quality Checks <InfoTip text={`${QUALITY_INFO} Reviewer: ${run.config.reviewer?.label}.`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {keys.map((k) => (
                  <Stat
                    key={k}
                    label={metricLabel(k, run.config)}
                    value={fmt(s.metrics[k])}
                    info={k.startsWith("rule_") ? run.config.customRules[Number(k.slice(5)) - 1] : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Guardrail</TableHead>
                <TableHead>Answer / AI Quality</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.results.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-xs whitespace-normal align-top">{r.prompt}</TableCell>
                  <TableCell className="align-top">
                    <ExpectedBadge expected={r.expected} />
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    {r.error ? (
                      <span className="text-amber-600">Error: {r.error}</span>
                    ) : r.blocked ? (
                      <span>Blocked{r.blockedBy && <span className="text-muted-foreground"> by {r.blockedBy}</span>}</span>
                    ) : (
                      "Allowed"
                    )}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal align-top text-sm">
                    {r.modelError && <p className="mb-2 text-amber-600">Model error: {r.modelError}</p>}
                    {r.answer && <p className="mb-2 line-clamp-4 text-muted-foreground">{r.answer}</p>}
                    {Object.entries(r.quality).map(([k, g]) => (
                      <div key={k}>
                        <span className="font-medium">{metricLabel(k, run.config)}:</span> {g.score ?? "Not graded"}
                        {g.reason && <span className="text-muted-foreground"> · {g.reason}</span>}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="align-top">
                    {r.passed ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600">Pass</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-500/10 text-red-600">Fail</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Page ----------------

export default function TestRuns({ applicationId }: { applicationId: string }) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [viewing, setViewing] = useState<Run | null>(null);
  const [deleting, setDeleting] = useState<Run | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(
    () =>
      listTestRuns(applicationId)
        .then((r) => {
          setRuns(r);
          return r;
        })
        .catch((e) => {
          errorToast(e?.message || "Could not load test runs");
          return [] as Run[];
        }),
    [applicationId],
  );
  useEffect(() => {
    load();
    return () => {
      stopRef.current = true;
    };
  }, [load]);

  // ponytail: the browser drives the run one prompt per request (fresh gateway token, live progress).
  // Closing the page pauses it; "Resume" continues. Move to a server job queue if runs get large.
  const drive = async (runId: string) => {
    const run = (await load()).find((r) => r.id === runId);
    if (!run) return;
    setActive(runId);
    stopRef.current = false;
    try {
      let errors = 0;
      for (let i = run.results.length; i < run.items.length && !stopRef.current; i++) {
        const result = await runTestRunItem(runId, i);
        if (result.error || result.modelError) errors++;
        setRuns((prev) =>
          prev?.map((r) =>
            r.id === runId
              ? { ...r, results: [...r.results, result], status: i === r.items.length - 1 ? "completed" : r.status }
              : r,
          ) ?? prev,
        );
      }
      if (stopRef.current) return;
      if (errors) errorToast(`Test run finished, but ${errors} prompt(s) failed. Open the results to see why.`);
      else successToast("", "", "", "Test run finished");
    } catch (e: any) {
      errorToast(e?.message || "Test run stopped");
    } finally {
      setActive(null);
      load();
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Test Runs"
        description="Run a dataset through this application's guardrails and grade every answer with Guardrail Checks and AI Quality Checks."
        actions={
          <Button onClick={() => setWizardOpen(true)} disabled={!!active}>
            <Plus className="mr-2 h-4 w-4" />
            New test run
          </Button>
        }
      />

      {runs === null ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
          No test runs yet. Click <span className="font-medium">New test run</span> to start one.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test run</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Trust Score</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => {
              const done = r.results.length;
              const finished = done >= r.items.length;
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-sm text-muted-foreground">{r.datasetName}</div>
                  </TableCell>
                  <TableCell>{r.config.target.label}</TableCell>
                  <TableCell className="min-w-40">
                    {finished ? (
                      <Badge variant="secondary">Completed</Badge>
                    ) : (
                      <div className="space-y-1">
                        <Progress value={(done / r.items.length) * 100} />
                        <div className="text-xs text-muted-foreground">
                          {done}/{r.items.length} {active === r.id ? "running…" : "paused"}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{done ? <TrustBadge score={summarize(r.results).trustScore} /> : "–"}</TableCell>
                  <TableCell>{getFormattedDateString(r.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${r.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={!done} onClick={() => setViewing(r)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View results
                        </DropdownMenuItem>
                        {!finished &&
                          (active === r.id ? (
                            <DropdownMenuItem onClick={() => (stopRef.current = true)}>
                              <Pause className="mr-2 h-4 w-4" />
                              Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled={!!active} onClick={() => drive(r.id)}>
                              <Play className="mr-2 h-4 w-4" />
                              Resume
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuItem disabled={active === r.id} onClick={() => setDeleting(r)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <NewRunDialog open={wizardOpen} onOpenChange={setWizardOpen} applicationId={applicationId} onStarted={drive} />
      <ResultsDialog run={viewing && (runs?.find((r) => r.id === viewing.id) ?? viewing)} onClose={() => setViewing(null)} />
      <DeleteConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        isLoading={false}
        title="Delete test run"
        itemName={deleting?.name ?? ""}
        itemType="test run"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteTestRun(deleting.id).catch((e) => errorToast(e?.message || "Delete failed"));
          setDeleting(null);
          load();
        }}
      />
    </div>
  );
}
