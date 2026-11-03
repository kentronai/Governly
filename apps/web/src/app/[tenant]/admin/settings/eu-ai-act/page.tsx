"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { errorToast, successToast } from "@/lib/utils/toast";
import {
  getEuAiActControls,
  saveEuAiActControls,
  type EuAiActControlData,
} from "@/lib/actions/eu-ai-act";

type Subcontrol = { key: string; title: string; description: string };
type Requirement = {
  key: string;
  title: string;
  description: string;
  subcontrols: Subcontrol[];
};
type Section = { key: string; title: string; requirements: Requirement[] };

const SECTIONS: Section[] = [
  {
    key: "1",
    title: "AI literacy",
    requirements: [
      {
        key: "1.1",
        title: "AI Literacy and Responsible AI Training",
        description:
          "Develop the AI literacy of staff and others who operate or use AI systems on behalf of the organization.",
        subcontrols: [
          {
            key: "1.1.1",
            title:
              "We ensure executive leadership takes responsibility for decisions related to AI risks",
            description:
              "Leadership is accountable for oversight and strategic decisions regarding AI risks, ensuring alignment with compliance.",
          },
          {
            key: "1.1.2",
            title:
              "We provide AI literacy and ethics training to relevant personnel.",
            description:
              "Training equips employees to responsibly manage and understand AI systems, fostering ethics and legal adherence.",
          },
          {
            key: "1.1.3",
            title:
              "We develop a clear and concise communication plan for informing workers about the use of high-risk AI systems in the workplace.",
            description:
              "A concise plan ensures employees are informed of AI system impacts in their workplace roles and rights.",
          },
        ],
      },
      {
        key: "1.2",
        title: "Regulatory Training and Response Procedures",
        description:
          "Train personnel on regulatory requirements and procedures for responding to authority requests.",
        subcontrols: [
          {
            key: "1.2.1",
            title:
              "We clearly define roles and responsibilities related to AI risk management.",
            description:
              "Roles and responsibilities streamline risk management and assign clear accountability for compliance efforts.",
          },
          {
            key: "1.2.2",
            title:
              "We train personnel on the requirements of the regulation and the process for responding to requests from competent authorities.",
            description:
              "Personnel training ensures efficient regulatory responses and familiarity with legal requirements for AI systems.",
          },
        ],
      },
    ],
  },
];

// Underline tabs (black & white), matching the requirement/overview tab style.
const TAB_LIST =
  "h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0";
const TAB_TRIGGER =
  "flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent";

const STATUSES = ["Waiting", "In progress", "Done"];
const NONE = "__none__";
const ALL_SUBCONTROLS = SECTIONS.flatMap((s) =>
  s.requirements.flatMap((r) => r.subcontrols),
);

type User = { id: string; name: string | null; email: string };

const str = (value: unknown) => (typeof value === "string" ? value : "");
// A subcontrol counts as completed once any of its details are filled in (or it is marked Done).
const isDone = (data: Record<string, EuAiActControlData>, key: string) => {
  const c = data[key];
  return Boolean(
    c &&
      (c.status === "Done" ||
        ["implementation", "evidence", "auditorFeedback"].some((f) =>
          str(c[f]).trim(),
        )),
  );
};
const percent = (done: number, total: number) =>
  total ? Math.round((done / total) * 100) : 0;

export default function EuAiActPage() {
  const tenant = useParams().tenant as string;
  const [controls, setControls] = useState<Record<string, EuAiActControlData>>(
    {},
  );
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Requirement | null>(null);
  const [completionFor, setCompletionFor] = useState<Requirement | null>(null);

  const load = useCallback(async () => {
    try {
      setControls(await getEuAiActControls(tenant));
    } catch {
      errorToast("Unable to load EU AI Act requirements");
    } finally {
      setLoading(false);
    }
  }, [tenant]);

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

  const done = ALL_SUBCONTROLS.filter((s) => isDone(controls, s.key)).length;
  const overall = percent(done, ALL_SUBCONTROLS.length);

  return (
    <div className="min-h-full w-full bg-background p-5 lg:p-7">
      <div className="w-full space-y-6">
        <header>
          <PageTitle>EU AI Act</PageTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your organization&apos;s implementation of EU AI Act
            requirements.
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
                    Controls: {done} of {ALL_SUBCONTROLS.length} completed
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requirement</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead># of Controls</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.requirements.map((req) => (
                        <TableRow key={req.key}>
                          <TableCell className="whitespace-normal font-medium">
                            <button
                              type="button"
                              className="flex items-center gap-2 text-left hover:text-blue-600 hover:underline"
                              onClick={() => setSelected(req)}
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              {req.key} {req.title}
                            </button>
                          </TableCell>
                          <TableCell>{section.title}</TableCell>
                          <TableCell>
                            {userName(controls[req.key]?.owner)}
                          </TableCell>
                          <TableCell>
                            {req.subcontrols.length} Controls
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Actions for ${req.title}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setCompletionFor(req)}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  View completion
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setSelected(req)}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
        requirement={selected}
        controls={controls}
        users={users}
        onClose={() => setSelected(null)}
        onSaved={(entries) =>
          setControls((current) => ({ ...current, ...entries }))
        }
      />
    </div>
  );
}

function RequirementDialog({
  tenant,
  requirement,
  controls,
  users,
  onClose,
  onSaved,
}: {
  tenant: string;
  requirement: Requirement | null;
  controls: Record<string, EuAiActControlData>;
  users: User[];
  onClose: () => void;
  onSaved: (entries: Record<string, EuAiActControlData>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, EuAiActControlData>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!requirement) return;
    const keys = [
      requirement.key,
      ...requirement.subcontrols.map((s) => s.key),
    ];
    setDraft(
      Object.fromEntries(keys.map((key) => [key, { ...controls[key] }])),
    );
  }, [requirement, controls]);

  const set = (key: string, field: string, value: unknown) =>
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));

  const save = async () => {
    setSaving(true);
    try {
      await saveEuAiActControls(tenant, draft);
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
                {requirement.key} {requirement.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {requirement.description}
              </DialogDescription>
              <DescriptionBox text={requirement.description} />
            </DialogHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
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

              <Tabs
                defaultValue={requirement.subcontrols[0].key}
                key={requirement.key}
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
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t p-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
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
  data: EuAiActControlData;
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
            value={str(data.status) || "Waiting"}
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
  controls: Record<string, EuAiActControlData>;
  onClose: () => void;
}) {
  const done = requirement
    ? requirement.subcontrols.filter((s) => isDone(controls, s.key)).length
    : 0;
  const value = requirement ? percent(done, requirement.subcontrols.length) : 0;
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
                {done} of {requirement.subcontrols.length} controls completed
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3">
              <Progress value={value} className="flex-1" />
              <span className="text-sm font-semibold tabular-nums">
                {value}%
              </span>
            </div>
            <ul className="divide-y rounded-md border">
              {requirement.subcontrols.map((s) => {
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
                      {str(controls[s.key]?.status) || "Waiting"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
