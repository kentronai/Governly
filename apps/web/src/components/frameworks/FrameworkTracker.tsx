"use client";
import { cn } from "@/lib/utils";
import { LinkedRisks } from "./LinkedRisks";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Save,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTitle } from "@/components/common/PageHeader";
import { RichTextEditor } from "@/components/common/RichTextEditor";
import { errorToast, infoToast, successToast } from "@/lib/utils/toast";
import { readDraft, useDraft } from "@/hooks/useDraft";
import type { AutofillEntry } from "@/lib/actions/evidence-autofill";
import { mergeFill, useEvidenceUpload } from "./useEvidenceUpload";
import {
  getFrameworkControls,
  saveFrameworkControls,
  type FrameworkControlData,
} from "@/lib/actions/framework-controls";
import type {
  FrameworkDefinition,
  FrameworkRequirement,
} from "@/lib/frameworks";
import {
  controlKeys,
  isDone,
  percent,
  statusOf,
  str,
} from "@/lib/frameworks/helpers";

type Requirement = FrameworkRequirement;

// Underline tabs (black & white), matching the requirement/overview tab style.
const TAB_LIST =
  "h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0";
const TAB_TRIGGER =
  "flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";

const STATUSES = ["Not started", "In progress", "Done"];
const NONE = "__none__";

export type User = { id: string; name: string | null; email: string };

export function FrameworkTracker({
  framework,
}: {
  framework: FrameworkDefinition;
}) {
  const tenant = useParams().tenant as string;
  const SECTIONS = framework.sections;
  const ALL_REQUIREMENTS = SECTIONS.flatMap((s) => s.requirements);
  const [controls, setControls] = useState<
    Record<string, FrameworkControlData>
  >({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [completionFor, setCompletionFor] = useState<Requirement | null>(null);
  const [prefill, setPrefill] = useState<Record<string, AutofillEntry> | null>(
    null,
  );
  const { upload } = useEvidenceUpload();
  const uploadFor = async (req: Requirement) => {
    const fill = await upload(req);
    if (fill) {
      setPrefill(fill);
      setSelected(req);
    }
  };

  const load = useCallback(async () => {
    try {
      setControls(await getFrameworkControls(tenant, framework.slug));
    } catch {
      errorToast(`Unable to load ${framework.navLabel} requirements`);
    } finally {
      setLoading(false);
    }
  }, [tenant, framework.slug]);

  useEffect(() => {
    load();
    import("@/lib/actions/users")
      .then(({ getActiveUsers }) => getActiveUsers({ page: 1, pageSize: 200 }))
      .then((result) => result.success && setUsers(result.users as User[]))
      .catch(() => undefined);
  }, [load]);

  const userName = (id: unknown) => {
    const user = users.find((u) => u.id === id);
    return user ? user.name || user.email : "Not set";
  };

  // A requirement is complete once every one of its subcontrols is.
  const done = ALL_REQUIREMENTS.filter((r) =>
    controlKeys(r).every((k) => isDone(controls, k)),
  ).length;
  const overall = percent(done, ALL_REQUIREMENTS.length);

  return (
    <div className="min-h-full w-full bg-background p-5 lg:p-7">
      <div className="w-full space-y-6">
        <header>
          <PageTitle>{framework.name}</PageTitle>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            {framework.description}{" "}
            <a
              href={framework.source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Source: {framework.source.title}
            </a>
          </p>
        </header>

        {/* Rendered only after load (client-side) so Radix tab ids can't mismatch hydration. */}
        {loading ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg border">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">
              Loading requirements
            </span>
          </div>
        ) : (
          <Tabs defaultValue="requirements">
            <TabsList className={TAB_LIST}>
              <TabsTrigger value="requirements" className={TAB_TRIGGER}>
                <ClipboardList className="h-4 w-4" />
                Requirements
              </TabsTrigger>
            </TabsList>
            <TabsContent value="requirements" className="mt-4 space-y-6">
              <section className="flex items-center gap-4 rounded-lg border bg-card p-4">
                <div className="flex-1 space-y-2">
                  <Progress value={overall} />
                  <p className="text-xs text-muted-foreground">
                    Requirements: {done} of {ALL_REQUIREMENTS.length} completed
                  </p>
                </div>
                <span className="text-2xl font-semibold tabular-nums">
                  {overall}%
                </span>
              </section>

              <h2 className="text-lg font-semibold">
                Compliance status overview
              </h2>

              {SECTIONS.map((section) => (
                <div key={section.key} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-xs text-background">
                      {section.key}
                    </span>
                    {section.title}
                  </h3>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        {/* Fixed widths keep columns aligned across every section's table. */}
                        <TableHead className="w-[44%]">Requirement</TableHead>
                        <TableHead className="w-[24%]">Category</TableHead>
                        <TableHead className="w-[12%]">Owner</TableHead>
                        <TableHead className="w-[12%]">
                          {section.requirements.some(
                            (r) => r.subcontrols.length,
                          )
                            ? "# of Controls"
                            : "Status"}
                        </TableHead>
                        <TableHead className="w-[8%] text-right">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.requirements.map((req) => (
                        <TableRow key={req.key}>
                          <TableCell className="whitespace-normal font-medium">
                            <button
                              type="button"
                              className={cn(
                                "flex items-center gap-2 text-left hover:text-blue-600 hover:underline",
                                req.nested && "pl-6 font-normal",
                              )}
                              onClick={() => setSelected(req)}
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              {req.key} {req.title}
                            </button>
                          </TableCell>
                          <TableCell className="truncate" title={section.title}>
                            {section.title}
                          </TableCell>
                          <TableCell className="truncate">
                            {userName(controls[req.key]?.owner)}
                          </TableCell>
                          <TableCell className="truncate">
                            {req.subcontrols.length
                              ? `${req.subcontrols.length} Controls`
                              : statusOf(controls[req.key])}
                          </TableCell>
                          <TableCell className="text-right">
                            <RowActionsMenu
                              label={`Actions for ${req.title}`}
                              items={[
                                { label: "View", icon: Eye, onSelect: () => setCompletionFor(req) },
                                { label: "Edit", icon: Pencil, onSelect: () => setSelected(req) },
                                { label: "Upload evidence document", icon: Upload, onSelect: () => void uploadFor(req) },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <CompletionDialog
        requirement={completionFor}
        controls={controls}
        onClose={() => setCompletionFor(null)}
      />
      <RequirementDialog
        tenant={tenant}
        framework={framework.slug}
        requirement={selected}
        prefill={prefill}
        controls={controls}
        users={users}
        onClose={() => {
          setSelected(null);
          setPrefill(null);
        }}
        onSaved={(entries) =>
          setControls((current) => ({ ...current, ...entries }))
        }
      />
    </div>
  );
}

export function RequirementDialog({
  tenant,
  framework,
  requirement,
  controls,
  users,
  heading,
  tab,
  prefill,
  onClose,
  onSaved,
}: {
  tenant: string;
  framework: string;
  requirement: Requirement | null;
  /** Subcontrol key to open on; defaults to the first. */
  tab?: string;
  /** Dialog title; defaults to the requirement's own "key title". */
  heading?: string;
  /** AI-drafted details from an uploaded document, merged into the form on open. */
  prefill?: Record<string, AutofillEntry> | null;
  controls: Record<string, FrameworkControlData>;
  users: User[];
  onClose: () => void;
  onSaved: (entries: Record<string, FrameworkControlData>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, FrameworkControlData>>({});
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);
  const { busy: reading, upload } = useEvidenceUpload();

  // Unsaved input is kept (even after leaving the page or closing the browser) until
  // Save or Cancel. Closing with X / Esc keeps it; the next open restores it.
  const draftKey = requirement
    ? `${tenant}:${framework}:${requirement.key}`
    : null;
  const clearDraft = useDraft(draftKey, draft, edited);

  useEffect(() => {
    if (!requirement || !draftKey) return;
    const keys = [
      requirement.key,
      ...requirement.subcontrols.map((s) => s.key),
    ];
    const base = Object.fromEntries(
      keys.map((key) => [key, { ...controls[key] }]),
    );
    const stored = readDraft<Record<string, FrameworkControlData>>(draftKey);
    if (stored) infoToast("Restored your unsaved changes.");
    const start = stored ? { ...base, ...stored } : base;
    setDraft(prefill ? mergeFill(start, prefill) : start);
    setEdited(Boolean(stored || prefill));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only when the control opens, so a parent re-render can't wipe typing
  }, [requirement, prefill]);

  const set = (key: string, field: string, value: unknown) => {
    setEdited(true);
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  };

  const fromDocument = async () => {
    if (!requirement) return;
    const fill = await upload(requirement);
    if (!fill) return;
    setEdited(true);
    setDraft((current) => mergeFill(current, fill));
  };

  const cancel = () => {
    clearDraft();
    onClose();
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveFrameworkControls(tenant, framework, draft);
      clearDraft();
      onSaved(draft);
      successToast("Requirement saved", requirement?.title ?? "", "updated");
      onClose();
    } catch (error) {
      errorToast(
        error instanceof Error ? error.message : "Unable to save requirement",
      );
    } finally {
      setSaving(false);
    }
  };

  const meta = requirement ? (draft[requirement.key] ?? {}) : {};

  return (
    <Dialog
      open={Boolean(requirement)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-5xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        {requirement && (
          <div className="flex max-h-[90vh] flex-col">
            <DialogHeader className="shrink-0 space-y-3 border-b p-5 pr-12">
              <DialogTitle className="text-lg">
                {heading ?? `${requirement.key} ${requirement.title}`}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {requirement.description}
              </DialogDescription>
              {requirement.description !== requirement.summary && (
                <DescriptionBox text={requirement.description} />
              )}
            </DialogHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  Have a policy, report or screenshot export? Upload it and the
                  details below are filled in for you to review.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reading}
                  onClick={() => void fromDocument()}
                >
                  {reading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  Upload document
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(["owner", "reviewer", "approver"] as const).map((field) => (
                  <div key={field} className="space-y-1.5">
                    <Label className="capitalize">{field}</Label>
                    <Select
                      value={str(meta[field]) || NONE}
                      onValueChange={(v) =>
                        set(requirement.key, field, v === NONE ? "" : v)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>(none)</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    value={str(meta.dueDate)}
                    onChange={(e) =>
                      set(requirement.key, "dueDate", e.target.value)
                    }
                  />
                </div>
              </div>

              {requirement.subcontrols.length === 0 ? (
                <div className="space-y-4">
                  <Guidance requirement={requirement} />
                  <SubcontrolDetails
                    data={draft[requirement.key] ?? {}}
                    onChange={(field, value) =>
                      set(requirement.key, field, value)
                    }
                  />
                  <LinkedRisks
                    tenant={tenant}
                    controlId={`${framework}:${requirement.key}`}
                  />
                </div>
              ) : (
                <Tabs
                  defaultValue={tab ?? requirement.subcontrols[0].key}
                  key={`${requirement.key}:${tab}`}
                >
                  <TabsList className={TAB_LIST}>
                    {requirement.subcontrols.map((s, i) => (
                      <TabsTrigger
                        key={s.key}
                        value={s.key}
                        className={TAB_TRIGGER}
                      >
                        Subcontrol {i + 1}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {requirement.subcontrols.map((s) => (
                    <TabsContent
                      key={s.key}
                      value={s.key}
                      className="mt-4 space-y-4"
                    >
                      <h3 className="font-semibold">
                        {s.key} {s.title}
                      </h3>
                      <DescriptionBox text={s.description} />
                      <SubcontrolDetails
                        data={draft[s.key] ?? {}}
                        onChange={(field, value) => set(s.key, field, value)}
                      />
                      <LinkedRisks
                        tenant={tenant}
                        controlId={`${framework}:${s.key}`}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
              <RecordMetadata
                className="mt-4"
                updatedAt={controls[requirement.key]?._updatedAt as string | undefined}
                updatedBy={controls[requirement.key]?._updatedBy as string | undefined}
              />
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t p-4">
              <Button variant="outline" onClick={cancel}>
                Cancel
              </Button>
              <Button data-autosave onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubcontrolDetails({
  data,
  onChange,
}: {
  data: FrameworkControlData;
  onChange: (field: string, value: unknown) => void;
}) {
  return (
    <Tabs defaultValue="details">
      <TabsList className={TAB_LIST}>
        <TabsTrigger value="details" className={TAB_TRIGGER}>
          Details
        </TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <Label>Implementation description</Label>
          <RichTextEditor
            placeholder="Describe how this requirement is implemented…"
            value={str(data.implementation)}
            onChange={(v) => onChange("implementation", v)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={statusOf(data)}
            onValueChange={(v) => onChange("status", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Evidence</Label>
          <RichTextEditor
            placeholder="Describe the evidence for this control…"
            value={str(data.evidence)}
            onChange={(v) => onChange("evidence", v)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Auditor feedback</Label>
          <RichTextEditor
            placeholder="Auditor feedback…"
            value={str(data.auditorFeedback)}
            onChange={(v) => onChange("auditorFeedback", v)}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Guidance({ requirement }: { requirement: Requirement }) {
  const { summary, keyQuestions = [], evidenceExamples = [] } = requirement;
  return (
    <>
      {summary && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Summary:</p>
          <p className="mt-1 text-muted-foreground">{summary}</p>
        </div>
      )}
      {keyQuestions.length > 0 && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">Key Questions:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {keyQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {evidenceExamples.length > 0 && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <p className="font-medium">Evidence Examples:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {evidenceExamples.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function DescriptionBox({ text }: { text: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="font-medium text-foreground">Description:</p>
      <p className="mt-1 text-muted-foreground">{text}</p>
    </div>
  );
}

function CompletionDialog({
  requirement,
  controls,
  onClose,
}: {
  requirement: Requirement | null;
  controls: Record<string, FrameworkControlData>;
  onClose: () => void;
}) {
  // Flat requirements are their own single control.
  const items = requirement
    ? requirement.subcontrols.length
      ? requirement.subcontrols
      : [{ key: requirement.key, title: requirement.title }]
    : [];
  const done = requirement
    ? items.filter((s) => isDone(controls, s.key)).length
    : 0;
  const value = requirement ? percent(done, items.length) : 0;
  return (
    <Dialog
      open={Boolean(requirement)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-lg">
        {requirement && (
          <>
            <DialogHeader>
              <DialogTitle>
                {requirement.key} {requirement.title}
              </DialogTitle>
              <DialogDescription>
                {done} of {items.length} controls completed
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <Progress value={value} className="flex-1" />
              <span className="text-sm font-semibold tabular-nums">
                {value}%
              </span>
            </div>
            <ul className="divide-y rounded-md border">
              {items.map((s) => {
                const complete = isDone(controls, s.key);
                return (
                  <li
                    key={s.key}
                    className="flex items-start gap-3 p-3 text-sm"
                  >
                    {complete ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1">
                      {s.key} {s.title}
                    </span>
                    <Badge variant={complete ? "default" : "outline"}>
                      {statusOf(controls[s.key])}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {(() => {
              // Most recent save across this requirement's controls.
              const latest = items
                .map((s) => controls[s.key])
                .filter((c) => c?._updatedAt)
                .sort((a, b) => String(b._updatedAt).localeCompare(String(a._updatedAt)))[0];
              return (
                <RecordMetadata
                  updatedAt={latest?._updatedAt as string | undefined}
                  updatedBy={latest?._updatedBy as string | undefined}
                />
              );
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
