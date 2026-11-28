"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  Search,
  ShieldAlert,
  Unlock,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { LocalTime } from "@/components/common/LocalTime";
import { RecordViewDialog } from "@/components/common/RecordViewDialog";
import { RowActionsMenu } from "@/components/common/RowActionsMenu";
import Pagination from "@/components/common/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { errorToast, successToast } from "@/lib/utils/toast";
import {
  getShadowAiActivity,
  getShadowAiTrends,
  importAiUsageLog,
  listShadowAiTools,
  updateShadowAiTool,
  type ShadowAiToolChange,
  type ShadowAiToolRow,
} from "@/lib/actions/shadow-ai";
import {
  parseAiUsageLog,
  SHADOW_AI_STATUSES,
  STATUS_LABEL,
  type ShadowAiStatus,
} from "@/lib/shadow-ai";

const STATUS_STYLE: Record<ShadowAiStatus, string> = {
  sanctioned:
    "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  tolerated:
    "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  unsanctioned:
    "border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  unknown:
    "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

export function StatusBadge({ status }: { status: ShadowAiStatus }) {
  return <Badge className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Badge>;
}

function RiskBadge({ risk }: { risk: number }) {
  const level = risk >= 60 ? "High" : risk >= 35 ? "Medium" : "Low";
  return (
    <Badge
      variant={risk >= 60 ? "destructive" : "outline"}
      className="tabular-nums"
    >
      {risk} · {level}
    </Badge>
  );
}

type Editing = {
  tool: ShadowAiToolRow;
  mode: "status" | "risk" | "block" | "unblock";
  status?: ShadowAiStatus;
};

const ALL = "__all__";

/** Client-side paging for the small governance tables, rendered with the shared Pagination. */
function usePaged<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => setPage(1), [rows.length, pageSize]);
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: rows.length > 0 && (
      <Pagination
        page={Math.min(page, totalPages)}
        setPage={setPage}
        totalPages={totalPages}
        pageSize={pageSize}
        setPageSize={setPageSize}
      />
    ),
  };
}

/** Label, risk and block for every AI tool seen: the governance view of the inventory. */
export function AiToolsTable({ reloadKey }: { reloadKey: number }) {
  const [tools, setTools] = useState<ShadowAiToolRow[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<ShadowAiToolRow | null>(null);
  const load = useCallback(() => {
    listShadowAiTools()
      .then(setTools)
      .catch((e) =>
        errorToast(e instanceof Error ? e.message : "Could not load AI tools."),
      );
  }, []);
  useEffect(load, [load, reloadKey]);
  useEffect(() => setPage(1), [q, status, category, pageSize]);

  const rows = useMemo(
    () =>
      (tools ?? []).filter(
        (t) =>
          (status === ALL ||
            (status === "blocked" ? !!t.blockedAt : t.status === status)) &&
          (category === ALL || t.category === category) &&
          (!q ||
            `${t.name} ${t.category}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [tools, q, status, category],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { blocked: 0 };
    for (const t of tools ?? []) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (t.blockedAt) c.blocked += 1;
    }
    return c;
  }, [tools]);
  const categories = useMemo(
    () => [...new Set((tools ?? []).map((t) => t.category))].sort(),
    [tools],
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-9 pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[180px]" aria-label="Labels">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All labels</SelectItem>
            {SHADOW_AI_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]} ({counts[s] ?? 0})
              </SelectItem>
            ))}
            <SelectItem value="blocked">Blocked ({counts.blocked})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[180px]" aria-label="Categories">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {tools ? `${rows.length} results` : ""}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>AI tool</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead className="text-right">Users</TableHead>
            <TableHead className="text-right">Machines</TableHead>
            <TableHead>First detected</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={8}
                className="text-center text-muted-foreground"
              >
                {tools === null ? "Loading…" : "No AI tools match."}
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((t) => (
              <TableRow key={t.name}>
                <TableCell className="font-medium">
                  {t.name}
                  {t.blockedAt && (
                    <Badge variant="destructive" className="ml-2">
                      <Ban className="mr-1 h-3 w-3" /> Blocked
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.category}
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} />
                </TableCell>
                <TableCell title={t.riskBasis}>
                  <RiskBadge risk={t.risk} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.users}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.machines}
                </TableCell>
                <TableCell>
                  <LocalTime value={t.firstSeenAt} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActionsMenu
                    label={`Actions for ${t.name}`}
                    items={[
                      {
                        label: "View",
                        icon: Eye,
                        onSelect: () => setViewing(t),
                      },
                      ...SHADOW_AI_STATUSES.filter((s) => s !== t.status).map(
                        (s) => ({
                          label: `Mark ${STATUS_LABEL[s].toLowerCase()}`,
                          icon: CheckCircle2,
                          onSelect: () =>
                            setEditing({ tool: t, mode: "status", status: s }),
                        }),
                      ),
                      {
                        label: "Override risk",
                        icon: ShieldAlert,
                        onSelect: () => setEditing({ tool: t, mode: "risk" }),
                      },
                      t.blockedAt
                        ? {
                            label: "Unblock",
                            icon: Unlock,
                            onSelect: () =>
                              setEditing({ tool: t, mode: "unblock" }),
                          }
                        : {
                            label: "Block",
                            icon: Ban,
                            destructive: true,
                            onSelect: () =>
                              setEditing({ tool: t, mode: "block" }),
                          },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {rows.length > 0 && (
        <Pagination
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />
      )}
      {viewing && (
        <RecordViewDialog
          open
          onClose={() => setViewing(null)}
          title={viewing.name}
          fields={[
            ["Category", viewing.category],
            [
              "Label",
              <>
                <StatusBadge status={viewing.status} />
                {viewing.statusReason && (
                  <span className="ml-2 text-muted-foreground">
                    {viewing.statusReason}
                  </span>
                )}
              </>,
            ],
            [
              "Risk",
              <>
                <RiskBadge risk={viewing.risk} />{" "}
                <span className="text-muted-foreground">
                  {viewing.riskBasis}
                </span>
              </>,
            ],
            ["Reach", `${viewing.users} users · ${viewing.machines} machines`],
            ["Last seen", <LocalTime key="ls" value={viewing.lastSeenAt} />],
            [
              "Blocked",
              viewing.blockedAt ? (
                <LocalTime key="b" value={viewing.blockedAt} />
              ) : (
                "No"
              ),
            ],
            ["Approved alternative", viewing.alternative],
          ]}
          meta={{
            createdAt: viewing.firstSeenAt,
            updatedAt: viewing.lastSeenAt,
          }}
        />
      )}
      <ChangeDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

function ChangeDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: Editing | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [alternative, setAlternative] = useState("");
  const [score, setScore] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setReason("");
    setAlternative(editing?.tool.alternative ?? "");
    setScore(editing ? String(editing.tool.risk) : "");
  }, [editing]);
  if (!editing) return null;
  const { tool, mode } = editing;

  const save = async (change: ShadowAiToolChange) => {
    setSaving(true);
    try {
      await updateShadowAiTool(tool.name, change);
      successToast(
        null,
        "AI tool",
        "updated",
        "Saved and recorded in the audit trail.",
      );
      onSaved();
      onClose();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const title = {
    status: `Mark ${tool.name} as ${editing.status ? STATUS_LABEL[editing.status].toLowerCase() : ""}`,
    risk: `Override risk for ${tool.name}`,
    block: `Block ${tool.name}`,
    unblock: `Unblock ${tool.name}`,
  }[mode];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode === "block" && (
            <DialogDescription>
              Marks it unsanctioned. Computers running the Governly scanner
              close the app within 5 minutes and tell the user. Websites and
              browser extensions are blocked through the browser policy (Block
              policy button).
            </DialogDescription>
          )}
        </DialogHeader>
        {
          <div className="space-y-3">
            {mode === "risk" && (
              <div className="space-y-1">
                <Label htmlFor="risk">Risk score (0 safe – 100 risky)</Label>
                <Input
                  id="risk"
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Current basis: {tool.riskBasis}
                </p>
              </div>
            )}
            {mode === "block" && (
              <div className="space-y-1">
                <Label htmlFor="alt">
                  Approved alternative (shown to the user)
                </Label>
                <Input
                  id="alt"
                  placeholder="e.g. Claude (company workspace)"
                  value={alternative}
                  onChange={(e) => setAlternative(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="reason">
                Reason{mode === "risk" ? " (required)" : ""}
              </Label>
              <Textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        }
        {
          <DialogFooter>
            {mode === "risk" && tool.riskOverridden && (
              <Button
                variant="outline"
                disabled={saving}
                onClick={() =>
                  save({ kind: "risk", score: null, reason: reason || "Reset" })
                }
              >
                Reset to default
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={mode === "block" ? "destructive" : "default"}
              disabled={
                saving ||
                (mode === "risk" &&
                  (!reason.trim() ||
                    score === "" ||
                    Number(score) < 0 ||
                    Number(score) > 100))
              }
              onClick={() =>
                save(
                  mode === "status"
                    ? { kind: "status", status: editing.status!, reason }
                    : mode === "risk"
                      ? {
                          kind: "risk",
                          score: Math.round(Number(score)),
                          reason,
                        }
                      : mode === "block"
                        ? { kind: "block", alternative, reason }
                        : { kind: "unblock", reason },
                )
              }
            >
              {mode === "block"
                ? "Block"
                : mode === "unblock"
                  ? "Unblock"
                  : "Save"}
            </Button>
          </DialogFooter>
        }
      </DialogContent>
    </Dialog>
  );
}

const LINE_COLORS = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

/** Machines per AI tool over the last 30 days, plus the change from first to last day. */
export function TrendsPanel({ reloadKey }: { reloadKey: number }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getShadowAiTrends>
  > | null>(null);
  useEffect(() => {
    getShadowAiTrends(30)
      .then(setData)
      .catch((e) =>
        errorToast(e instanceof Error ? e.message : "Could not load trends."),
      );
  }, [reloadKey]);
  const changes = useMemo(
    () =>
      [...(data?.tools ?? [])].sort(
        (a, b) => Math.abs(b.change) - Math.abs(a.change) || b.last - a.last,
      ),
    [data],
  );
  const paged = usePaged(changes);
  if (!data)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
    );
  if (!data.days.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Trends start with the next scan; one point is recorded per day.
      </p>
    );

  const top = [...data.tools].sort((a, b) => b.last - a.last).slice(0, 5);
  const config = Object.fromEntries(
    top.map((t, i) => [`t${i}`, { label: t.name, color: LINE_COLORS[i] }]),
  ) satisfies ChartConfig;
  const points = data.days.map((day) => ({
    day: day.slice(5),
    ...Object.fromEntries(
      top.map((t, i) => [`t${i}`, data.series[t.name]?.[day] ?? 0]),
    ),
  }));

  return (
    <div className="space-y-4">
      <ChartContainer config={config} className="h-56 w-full">
        <LineChart data={points}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} width={28} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {top.map((_, i) => (
            <Line
              key={i}
              dataKey={`t${i}`}
              stroke={LINE_COLORS[i]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>AI tool</TableHead>
            <TableHead className="text-right">
              Machines {data.days[0]}
            </TableHead>
            <TableHead className="text-right">
              Machines {data.days[data.days.length - 1]}
            </TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.rows.map((t) => (
            <TableRow key={t.name}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {t.first}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {t.last}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  t.change > 0 && "text-red-600",
                  t.change < 0 && "text-emerald-600",
                )}
              >
                {t.change > 0 ? `+${t.change}` : t.change}
              </TableCell>
              <TableCell className="text-right">
                <RowActionsMenu
                  label={`Actions for ${t.name}`}
                  items={[
                    {
                      label: "View",
                      icon: Eye,
                      onSelect: () => setViewing(t.name),
                    },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {paged.pagination}
      {viewing && (
        <RecordViewDialog
          open
          onClose={() => setViewing(null)}
          title={viewing}
          fields={data.days
            .slice()
            .reverse()
            .map((day): [string, React.ReactNode] => [
              day,
              `${data.series[viewing]?.[day] ?? 0} machines`,
            ])}
        />
      )}
    </div>
  );
}

/** The permanent Shadow AI audit trail: detections and every decision about them. */
export function ActivityPanel({ reloadKey }: { reloadKey: number }) {
  const [rows, setRows] = useState<Awaited<
    ReturnType<typeof getShadowAiActivity>
  > | null>(null);
  useEffect(() => {
    getShadowAiActivity()
      .then(setRows)
      .catch((e) =>
        errorToast(e instanceof Error ? e.message : "Could not load activity."),
      );
  }, [reloadKey]);
  const [viewing, setViewing] = useState<
    NonNullable<typeof rows>[number] | null
  >(null);
  const paged = usePaged(rows ?? []);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        These records can&apos;t be edited or deleted. Each id is the reference
        auditors can verify in the report.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>By</TableHead>
            <TableHead>Record id</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground"
              >
                No activity yet.
              </TableCell>
            </TableRow>
          )}
          {rows === null && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-muted-foreground"
              >
                Loading…
              </TableCell>
            </TableRow>
          )}
          {paged.rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">
                <LocalTime value={r.createdAt} />
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {r.action.replace("shadow_ai.", "").replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>{r.message}</TableCell>
              <TableCell className="text-muted-foreground">
                {r.actor ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {r.id.slice(0, 8)}
              </TableCell>
              <TableCell className="text-right">
                <RowActionsMenu
                  label="Actions for this record"
                  items={[
                    { label: "View", icon: Eye, onSelect: () => setViewing(r) },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {paged.pagination}
      {viewing && (
        <RecordViewDialog
          open
          onClose={() => setViewing(null)}
          title={viewing.message}
          fields={[
            ["Event", viewing.action],
            ["When", <LocalTime key="w" value={viewing.createdAt} />],
            ["By", viewing.actor],
            [
              "Record id",
              <span key="id" className="font-mono text-xs">
                {viewing.id}
              </span>,
            ],
          ]}
        />
      )}
    </div>
  );
}

const LOG_SOURCES = [
  "Zscaler",
  "Netskope",
  "Palo Alto Prisma",
  "Cisco Umbrella",
  "Cloudflare Gateway",
  "Infoblox",
  "Other",
];

/** Proxy/DNS log import: parsed in the browser, only per-user AI service counts are sent. */
export function ImportLogsCard({ onImported }: { onImported: () => void }) {
  const [source, setSource] = useState("Zscaler");
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const usage = parseAiUsageLog(await file.text());
      if (!usage.length) {
        errorToast("No AI services found in that file.");
        return;
      }
      const r = await importAiUsageLog({ source, usage });
      successToast(
        null,
        "Logs",
        "imported",
        `Imported ${r.tools} AI services used by ${r.users} users.`,
      );
      onImported();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import proxy or DNS logs</CardTitle>
        <CardDescription>
          Covers web use the scanner can&apos;t see (phones, unmanaged devices).
          Export web or DNS logs from Zscaler, Netskope, Umbrella and others as
          CSV or text. The file is read in your browser; only which user used
          which AI service is uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOG_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button asChild variant="outline" disabled={busy}>
          <label className="cursor-pointer">
            <FileUp className="mr-2 h-4 w-4" />
            {busy ? "Importing…" : "Choose log file"}
            <input
              type="file"
              accept=".csv,.log,.txt,.tsv,text/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Header downloads: the audit report and the browser policy that blocks blocked AI websites. */
export function GovernanceDownloads() {
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href="/api/shadow-ai/report" download>
          <Download className="mr-2 h-4 w-4" /> Audit report
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Ban className="mr-2 h-4 w-4" /> Block policy
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a
              href="/api/shadow-ai/browser-policy?format=mobileconfig"
              download
            >
              Mac: Jamf profile (.mobileconfig)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/api/shadow-ai/browser-policy?format=reg" download>
              Windows: Intune / GPO (.reg)
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
