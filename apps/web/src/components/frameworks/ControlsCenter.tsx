"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";
import { errorToast } from "@/lib/utils/toast";
import { useTenant } from "@/contexts/TenantContext";
import {
  getAllFrameworkControls,
  type FrameworkControlData,
} from "@/lib/actions/framework-controls";
import {
  FRAMEWORKS,
  enabledFrameworks,
  type FrameworkDefinition,
} from "@/lib/frameworks";
import {
  buildControls,
  leafKey,
  type Control,
  type ControlMember,
} from "@/lib/frameworks/controls";
import { controlKeys, isDone, percent } from "@/lib/frameworks/helpers";
import { RequirementDialog, type User } from "./FrameworkTracker";
import { useEvidenceUpload } from "./useEvidenceUpload";
import type { AutofillEntry } from "@/lib/actions/evidence-autofill";

type Saved = Record<string, Record<string, FrameworkControlData>>;
type Kind = FrameworkDefinition["kind"];
const otherKind: Record<Kind, Kind> = {
  regulation: "framework",
  framework: "regulation",
};

export function ControlsCenter() {
  const tenant = useParams().tenant as string;
  const { policyStatus } = useTenant();
  const enabled = useMemo(
    () =>
      enabledFrameworks(
        policyStatus.activePolicyNames,
        policyStatus.enabledFrameworkSlugs,
      ),
    [policyStatus.activePolicyNames, policyStatus.enabledFrameworkSlugs],
  );
  const sections = useMemo(() => buildControls(enabled), [enabled]);
  // Every policy a control maps to, enabled or not: filling the control completes it too.
  const policies = useMemo(() => {
    const slugs = new Set(enabled.map((f) => f.slug));
    for (const s of sections)
      for (const c of s.controls)
        c.members.forEach((m) => slugs.add(m.framework.slug));
    return FRAMEWORKS.filter((f) => slugs.has(f.slug));
  }, [enabled, sections]);
  const isEnabled = (slug: string) => enabled.some((f) => f.slug === slug);

  const [saved, setSaved] = useState<Saved>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Control | null>(null);
  const [prefill, setPrefill] = useState<Record<string, AutofillEntry> | null>(
    null,
  );
  const { upload } = useEvidenceUpload();
  const uploadFor = async (control: Control) => {
    const fill = await upload(control.primary.requirement);
    if (fill) {
      setPrefill(fill);
      setSelected(control);
    }
  };
  const [kindChoice, setKindChoice] = useState<Kind>("regulation");
  const [policyFilter, setPolicyFilter] = useState("all");
  const countOf = (kind: Kind) =>
    sections
      .filter((s) => s.kind === kind)
      .reduce((n, s) => n + s.controls.filter((c) => !c.parent).length, 0);
  // Fall back to the other section when the chosen one has nothing enabled.
  const kind: Kind =
    countOf(kindChoice) || !countOf(otherKind[kindChoice])
      ? kindChoice
      : otherKind[kindChoice];
  const kindSections = useMemo(
    () => sections.filter((s) => s.kind === kind),
    [sections, kind],
  );
  const kindPolicies = enabled.filter((f) => f.kind === kind);
  const policy = kindPolicies.some((f) => f.slug === policyFilter)
    ? policyFilter
    : "all";

  // Filter to one active policy: keep the controls it maps to (and their heading rows).
  const visible = useMemo(() => {
    if (policy === "all") return kindSections;
    const mapped = (c: Control) =>
      c.members.some((m) => m.framework.slug === policy);
    return kindSections
      .map((s) => ({
        ...s,
        controls: s.controls.filter((c, i) =>
          c.parent
            ? s.controls
                .slice(i + 1)
                .some((d) => d.code.startsWith(`${c.code}.`) && mapped(d))
            : mapped(c),
        ),
      }))
      .filter((s) => s.controls.length);
  }, [kindSections, policy]);

  const load = useCallback(
    () =>
      getAllFrameworkControls(tenant)
        .then(setSaved)
        .catch(() => errorToast("Unable to load controls")),
    [tenant],
  );
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    import("@/lib/actions/users")
      .then(({ getActiveUsers }) => getActiveUsers({ page: 1, pageSize: 200 }))
      .then((result) => result.success && setUsers(result.users as User[]))
      .catch(() => undefined);
  }, []);

  const leafDone = (m: ControlMember) =>
    isDone(saved[m.framework.slug] ?? {}, leafKey(m));
  const controlDone = (c: Control) =>
    c.parent
      ? controlKeys(c.primary.requirement).every((k) =>
          isDone(saved[c.primary.framework.slug] ?? {}, k),
        )
      : c.members.some(leafDone);

  const gauges = policies.map((f) => {
    const keys = f.sections.flatMap((s) => s.requirements.flatMap(controlKeys));
    const done = keys.filter((k) => isDone(saved[f.slug] ?? {}, k)).length;
    return { slug: f.slug, name: f.navLabel, done, total: keys.length };
  });
  const rows = sections.flatMap((s) => s.controls.filter((c) => !c.parent));
  const rowsDone = rows.filter(controlDone).length;

  return (
    <div className="min-h-full w-full space-y-6 bg-background p-5 lg:p-7">
      <PageHeader
        title="Controls"
        description="One list of the controls your enabled policies require. Complete a control once and every policy it maps to is updated."
        actions={
          enabled.length > 0 && (
            <Select value={policy} onValueChange={setPolicyFilter}>
              <SelectTrigger className="w-60" aria-label="Filter by policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {kind === "regulation"
                    ? "All active regulations"
                    : "All active frameworks"}
                </SelectItem>
                {kindPolicies.map((f) => (
                  <SelectItem key={f.slug} value={f.slug}>
                    {f.navLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {loading ? (
        <div className="flex min-h-40 items-center justify-center rounded-lg border">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Loading controls
          </span>
        </div>
      ) : !enabled.length ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border bg-card text-center">
          <ListChecks className="mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold">No policies enabled</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable a policy under Regulations &amp; Frameworks to see its
            controls here.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <Gauge
              label="Overall (enabled)"
              value={percent(rowsDone, rows.length)}
              caption={`${rowsDone}/${rows.length} controls`}
            />
            {gauges.map((g) => (
              <Gauge
                key={g.slug}
                label={g.name}
                value={percent(g.done, g.total)}
                caption={`${g.done}/${g.total} controls`}
                muted={!isEnabled(g.slug)}
              />
            ))}
          </section>

          <Tabs
            value={kind}
            onValueChange={(v) => {
              setKindChoice(v as Kind);
              setPolicyFilter("all");
            }}
          >
            <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
              <TabsTrigger value="regulation" className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2 text-muted-foreground shadow-none data-[state=active]:border-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-muted-foreground dark:data-[state=active]:bg-transparent">
                Regulation controls ({countOf("regulation")})
              </TabsTrigger>
              <TabsTrigger value="framework" className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2 text-muted-foreground shadow-none data-[state=active]:border-muted-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-muted-foreground dark:data-[state=active]:bg-transparent">
                Framework controls ({countOf("framework")})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {!visible.length && (
            <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
              {kind === "regulation"
                ? "No regulations enabled. Enable one under Regulations & Frameworks."
                : "No frameworks enabled. Enable one under Regulations & Frameworks → Frameworks."}
            </p>
          )}

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[6%]">Control No</TableHead>
                <TableHead className="w-[11%]">Control</TableHead>
                <TableHead className="w-[22%]">Control Name</TableHead>
                <TableHead className="w-[31%]">Description</TableHead>
                <TableHead className="w-[24%]">Mapping</TableHead>
                <TableHead className="w-[6%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((section) => (
                <Fragment key={section.code}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell className="font-semibold">
                      {section.no}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {section.code}
                    </TableCell>
                    <TableCell className="whitespace-normal font-semibold">
                      {section.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {section.controls.filter((c) => !c.parent).length}{" "}
                      controls
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  {section.controls.map((control) => (
                    <TableRow key={control.code}>
                      <TableCell>{control.no}</TableCell>
                      <TableCell>{control.code}</TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-normal",
                          control.parent ? "font-semibold" : "font-medium",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center gap-2",
                            (control.nested ||
                              control.code.split(".").length > 2) &&
                              "pl-4",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              controlDone(control)
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/30",
                            )}
                            title={
                              controlDone(control)
                                ? "Completed"
                                : "Not completed"
                            }
                          />
                          {control.title}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground">
                        {control.description}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap gap-1">
                          {control.members.map((m) => (
                            <Badge
                              key={m.framework.slug}
                              variant={
                                isEnabled(m.framework.slug)
                                  ? "secondary"
                                  : "outline"
                              }
                              title={
                                isEnabled(m.framework.slug)
                                  ? undefined
                                  : "Not enabled for your organization"
                              }
                            >
                              {m.framework.navLabel}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${control.code}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setSelected(control)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Add / edit details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void uploadFor(control)}
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Upload evidence document
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <RequirementDialog
        tenant={tenant}
        framework={selected?.primary.framework.slug ?? ""}
        requirement={selected?.primary.requirement ?? null}
        prefill={prefill}
        tab={selected?.primary.sub?.key}
        heading={selected?.heading}
        controls={saved[selected?.primary.framework.slug ?? ""] ?? {}}
        users={users}
        onClose={() => {
          setSelected(null);
          setPrefill(null);
        }}
        // The server copies the answers to every mapped policy; reload to show them.
        onSaved={() => void load()}
      />
    </div>
  );
}

function Gauge({
  label,
  value,
  caption,
  muted,
}: {
  label: string;
  value: number;
  caption: string;
  muted?: boolean;
}) {
  // Plain SVG ring: crisp at any zoom (the chart library rendered it soft).
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-lg border bg-card px-3 py-2",
        muted && "opacity-70",
      )}
      title={muted ? `${label} (not enabled)` : label}
    >
      <div className="relative h-11 w-11 shrink-0">
        <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            strokeWidth="5"
            className="stroke-muted"
          />
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
            className="stroke-primary"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums">
          {value}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}
