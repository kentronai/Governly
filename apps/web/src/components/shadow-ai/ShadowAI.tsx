"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Apple,
  AppWindow,
  CheckCircle2,
  Download,
  Eye,
  Monitor,
  MoreHorizontal,
  Radar,
  RefreshCcw,
  Search,
  Server,
  Terminal,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LocalTime } from "@/components/common/LocalTime";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { RecordMetadata } from "@/components/common/RecordMetadata";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import Pagination from "@/components/common/pagination";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorToast, infoToast } from "@/lib/utils/toast";
import {
  createScanKey,
  deleteMachineScan,
  getMachineScan,
  queryShadowAi,
  saveBrowserScan,
  type MachineRow,
  type McpRow,
  type ShadowAiKind,
} from "@/lib/actions/shadow-ai";
import type { MachineScanResult } from "@/lib/shadow-ai";

/**
 * The local scan helper (shadow-ai-scan.py --serve): started by the org installer (.pkg) or by
 * the one-liner's --install. Loopback only; answers only trusted Governly origins.
 */
const HELPER_URL = "http://127.0.0.1:8766";
const HELPER_SCAN_URL = `${HELPER_URL}/scan`;

/** Cheap presence check. Older helpers 404 /health, which still proves one is listening. */
async function helperRunning(): Promise<boolean> {
  try {
    await fetch(`${HELPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function fetchHelperScan(): Promise<MachineScanResult> {
  const res = await fetch(HELPER_SCAN_URL, { headers: { "X-Shadow-AI-Scan": "1" } });
  if (!res.ok) throw new Error(`helper answered ${res.status}`);
  return res.json();
}

function copy(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => infoToast("Copied. Paste it into Terminal."))
    .catch(() => errorToast("Copy failed; select the text instead."));
}

/** One-time helper setup for a single computer (then the page's Scan button works on it). */
function setupCommands(origin: string) {
  return {
    unix:
      `mkdir -p ~/.governly && curl -fsSL ${origin}/shadow-ai-scan.py -o ~/.governly/shadow-ai-scan.py && ` +
      `python3 ~/.governly/shadow-ai-scan.py --install --allow-origin ${origin}`,
    windows:
      `New-Item -ItemType Directory -Force "$HOME\\.governly" | Out-Null; ` +
      `Invoke-WebRequest ${origin}/shadow-ai-scan.py -OutFile "$HOME\\.governly\\shadow-ai-scan.py"; ` +
      `py -3 "$HOME\\.governly\\shadow-ai-scan.py" --install --allow-origin ${origin}`,
  };
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="mt-3 space-y-2">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">
        {command}
      </pre>
      <Button variant="outline" size="sm" onClick={() => copy(command)}>
        Copy command
      </Button>
    </div>
  );
}

/**
 * The page cannot read the disk, so it asks the local helper. Computers that got the org
 * installer already run it; the one-liner is only offered when no helper answers.
 */
function ScanThisComputer({ origin, onScanned }: { origin: string; onScanned: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [helper, setHelper] = useState<"checking" | "found" | "missing">("checking");

  useEffect(() => {
    helperRunning().then((ok) => setHelper(ok ? "found" : "missing"));
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      let result: MachineScanResult;
      try {
        result = await fetchHelperScan();
      } catch {
        setHelper("missing"); // not installed, not running, or browser prompt declined
        return;
      }
      setHelper("found");
      await saveBrowserScan(result);
      infoToast("This computer was scanned.");
      onScanned();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Could not save the scan.");
    } finally {
      setScanning(false);
    }
  }, [onScanned]);

  // While the fallback setup is on screen, scan the moment a helper starts answering.
  useEffect(() => {
    if (helper !== "missing" || scanning) return;
    const timer = setInterval(() => {
      helperRunning().then((ok) => {
        if (!ok) return;
        clearInterval(timer);
        void scan();
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [helper, scanning, scan]);

  const [isWindows, setIsWindows] = useState(false);
  useEffect(() => setIsWindows(/Win/i.test(navigator.userAgent)), []);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent)), []);
  const { unix: unixCommand, windows: windowsCommand } = setupCommands(origin);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Scan this computer</CardTitle>
          <CardDescription>
            Finds the AI apps, AI CLI tools and MCP servers on this computer. Secret values are
            masked before anything leaves it.
          </CardDescription>
        </div>
        <Button onClick={scan} disabled={scanning || helper === "checking"}>
          <Radar className="mr-2 h-4 w-4" />
          {scanning ? "Scanning…" : "Scan this computer"}
        </Button>
      </CardHeader>
      <CardContent>
        {helper === "checking" && <p className="text-sm text-muted-foreground">Looking for the Governly scan helper…</p>}
        {helper === "found" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Scan helper detected on this computer (installed by your organization or an earlier setup).
            Nothing else to install.
          </p>
        )}
        {helper === "missing" && (
          <>
            <p className="text-sm font-medium">No scan helper found on this computer</p>
            <p className="text-sm text-muted-foreground">
              If your IT team rolled out the Governly installer, make sure it finished and that you
              allowed this site to access devices on your local network, then click Scan again.
              Otherwise install it on this computer yourself; the scan then starts by itself.
            </p>
            {isMac ? (
              <div className="mt-3 space-y-2">
                <Button asChild variant="outline" size="sm">
                  <a href="/api/shadow-ai/installer" download>
                    <Download className="mr-2 h-4 w-4" />
                    Download Mac installer (.pkg)
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Double-click it and follow the steps. It installs the scan helper and the daily 6 PM scan.
                  Nothing to run in Terminal.
                </p>
              </div>
            ) : (
            <Tabs defaultValue={isWindows ? "windows" : "unix"} className="mt-3">
              <TabsList>
                <TabsTrigger value="unix">Linux (Terminal)</TabsTrigger>
                <TabsTrigger value="windows">Windows (PowerShell)</TabsTrigger>
              </TabsList>
              <TabsContent value="unix">
                <CommandBlock command={unixCommand} />
              </TabsContent>
              <TabsContent value="windows">
                <CommandBlock command={windowsCommand} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Needs Python 3 from python.org (it provides the <code>py</code> command).
                </p>
              </TabsContent>
            </Tabs>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Waiting for the helper…</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Servers have no browser: they run the scanner with a scan-only API key. */
function ScanServer({ origin }: { origin: string }) {
  const [key, setKey] = useState<{ token: string; expiresAt: string } | null>(null);
  const command = key
    ? `curl -fsSL ${origin}/shadow-ai-scan.py -o shadow-ai-scan.py\n` +
      `python3 shadow-ai-scan.py --url ${origin} --token ${key.token}`
    : "";
  const windowsCommand = key
    ? `Invoke-WebRequest ${origin}/shadow-ai-scan.py -OutFile shadow-ai-scan.py\n` +
      `py -3 shadow-ai-scan.py --url ${origin} --token ${key.token}`
    : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scan a server</CardTitle>
        <CardDescription>
          For servers without a browser. Run the command on the server (or from cron to keep it
          current); results upload here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {key ? (
          <>
            <Tabs defaultValue="unix">
              <TabsList>
                <TabsTrigger value="unix">Linux / macOS</TabsTrigger>
                <TabsTrigger value="windows">Windows (PowerShell)</TabsTrigger>
              </TabsList>
              <TabsContent value="unix">
                <CommandBlock command={command} />
              </TabsContent>
              <TabsContent value="windows">
                <CommandBlock command={windowsCommand} />
              </TabsContent>
            </Tabs>
            <p className="mt-2 text-xs text-muted-foreground">
              The key can only upload scans, expires <LocalTime value={key.expiresAt} mode="date" />, and
              can be revoked on the API Keys page.
            </p>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              createScanKey("server")
                .then(setKey)
                .catch((e) => errorToast(e instanceof Error ? e.message : "Could not create a key."))
            }
          >
            <Terminal className="mr-2 h-4 w-4" />
            Get server command
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}

/** Organization-wide rollout, per operating system. */
function DeployToComputers({ origin }: { origin: string }) {
  const [os, setOs] = useState("macos");
  useEffect(() => {
    if (/Win/i.test(navigator.userAgent)) setOs("windows");
  }, []);
  const { unix, windows } = setupCommands(origin);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deploy to your organization&apos;s computers</CardTitle>
        <CardDescription>
          Install the scanner on employee computers. Each one reports its AI apps, AI CLI tools and
          MCP servers here, with secret values masked on the device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={os} onValueChange={setOs}>
          <TabsList>
            <TabsTrigger value="macos">
              <Apple className="mr-2 h-4 w-4" />
              macOS
            </TabsTrigger>
            <TabsTrigger value="windows">
              <Monitor className="mr-2 h-4 w-4" />
              Windows
            </TabsTrigger>
          </TabsList>

          <TabsContent value="macos" className="mt-4 space-y-6">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">All Macs with Jamf</p>
                <Badge variant="secondary">Recommended</Badge>
              </div>
              <ol className="space-y-3 text-sm">
                <Step n={1}>
                  <p>Download the installer. It already contains your organization&apos;s key.</p>
                  <Button className="mt-2" asChild>
                    <a href="/api/shadow-ai/installer" download>
                      <Download className="mr-2 h-4 w-4" />
                      Download Mac installer (.pkg)
                    </a>
                  </Button>
                </Step>
                <Step n={2}>
                  In Jamf Pro, upload it under Settings &gt; Computer management &gt; Packages.
                </Step>
                <Step n={3}>
                  Add it to a policy scoped to your Macs. Each Mac scans itself at login and every day at 6 PM, and
                  appears below. It also runs the scan helper, so Scan this computer works on those
                  Macs with no extra setup. Employees don&apos;t need to do anything.
                </Step>
              </ol>
              <p className="text-xs text-muted-foreground">
                Each download creates a scan-only key, valid for a year, listed on the API Keys page as
                &quot;Shadow AI Jamf fleet&quot;. Revoke it there to stop those Macs reporting.
              </p>
            </section>

            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">A single Mac without Jamf</p>
              <p className="text-sm text-muted-foreground">
                Download the same installer and double-click it on that Mac. It installs the scan helper and
                the daily scan; nothing to run in Terminal.
              </p>
              <p className="text-sm font-medium">Linux</p>
              <p className="text-sm text-muted-foreground">Run this once in a terminal. Requires Python 3.</p>
              <CommandBlock command={unix} />
            </section>
          </TabsContent>

          <TabsContent value="windows" className="mt-4 space-y-3">
            <p className="text-sm font-medium">A Windows computer, manually</p>
            <ol className="space-y-3 text-sm">
              <Step n={1}>
                Install Python 3 from{" "}
                <a href="https://www.python.org/downloads/windows/" target="_blank" rel="noopener noreferrer" className="underline">
                  python.org
                </a>{" "}
                if it isn&apos;t installed.
              </Step>
              <Step n={2}>
                Open PowerShell (Start menu, type PowerShell) and run this once:
                <CommandBlock command={windows} />
              </Step>
              <Step n={3}>
                Open this page on that computer and click Scan this computer. If the browser asks to
                access devices on your local network, click Allow.
              </Step>
            </ol>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Server; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={mono ? "whitespace-pre-wrap break-all font-mono text-xs" : "text-sm"}>{value || "—"}</p>
    </div>
  );
}

type Result<K extends ShadowAiKind> = Awaited<ReturnType<typeof queryShadowAi<K>>>;
type Stats = Result<"machines">["stats"];
const ALL = "__all__";

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className="h-9 w-[180px]" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A server-filtered, server-paged table of one Shadow AI inventory. */
function InventoryTable<K extends ShadowAiKind>({
  kind,
  reloadKey,
  onStats,
  filters,
  columns,
  row,
  empty,
}: {
  kind: K;
  reloadKey: number;
  onStats: (s: Stats) => void;
  filters: ("machine" | "platform" | "source" | "transport")[];
  columns: string[];
  row: (r: Result<K>["rows"][number]) => React.ReactNode;
  empty: string;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [machine, setMachine] = useState("");
  const [platform, setPlatform] = useState("");
  const [source, setSource] = useState("");
  const [transport, setTransport] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<Result<K> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debouncedQ, machine, platform, source, transport]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    queryShadowAi(kind, { q: debouncedQ, machine, platform, source, transport, page, pageSize })
      .then((d) => {
        if (!live) return;
        setData(d);
        onStats(d.stats);
      })
      .catch((e) => errorToast(e instanceof Error ? e.message : "Could not load scans."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [kind, debouncedQ, machine, platform, source, transport, page, pageSize, reloadKey, onStats]);

  const facets = data?.facets;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 pl-8" />
        </div>
        {filters.includes("machine") && (
          <SearchableSelect
            className="h-9 w-[200px]"
            value={machine}
            onValueChange={setMachine}
            options={[{ value: "", label: "All machines" }, ...(facets?.machines ?? [])]}
            placeholder="All machines"
            searchPlaceholder="Search machines…"
          />
        )}
        {filters.includes("platform") && (
          <FilterSelect label="Platforms" value={platform} onChange={setPlatform} options={facets?.platforms ?? []} />
        )}
        {filters.includes("source") && (
          <FilterSelect
            label={kind === "apps" ? "Categories" : "Configured in"}
            value={source}
            onChange={setSource}
            options={facets?.sources ?? []}
          />
        )}
        {filters.includes("transport") && (
          <FilterSelect label="Transports" value={transport} onChange={setTransport} options={facets?.transports ?? []} />
        )}
        <span className="ml-auto text-xs text-muted-foreground">{data ? `${data.total} results` : ""}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead key={c} className={i === columns.length - 1 && c === "Actions" ? "text-right" : undefined}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!data || data.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                {loading ? "Loading…" : empty}
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map(row)
          )}
        </TableBody>
      </Table>
      {data && data.total > 0 && (
        <Pagination
          page={data.page}
          setPage={setPage}
          totalPages={data.totalPages}
          pageSize={pageSize}
          setPageSize={setPageSize}
          isLoading={loading}
        />
      )}
    </div>
  );
}

function RowMenu({ label, onView, onDelete }: { label: string; onView: () => void; onDelete?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${label}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        {onDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Viewing = { machineId: string; server?: McpRow };

function ViewDialog({ viewing, onClose }: { viewing: Viewing | null; onClose: () => void }) {
  const [machine, setMachine] = useState<Awaited<ReturnType<typeof getMachineScan>> | null>(null);
  useEffect(() => {
    setMachine(null);
    if (!viewing) return;
    getMachineScan(viewing.machineId)
      .then(setMachine)
      .catch((e) => errorToast(e instanceof Error ? e.message : "Could not load the machine."));
  }, [viewing]);

  const s = viewing?.server;
  const apps = machine?.result.applications.filter((a) => a.status === "installed") ?? [];
  const clis = machine?.result.cli_tools.filter((t) => t.installed) ?? [];
  return (
    <Dialog open={viewing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s ? s.name : (machine?.hostname ?? "Machine")}</DialogTitle>
          <DialogDescription>
            {s
              ? `MCP server on ${s.hostname}, configured in ${s.source_application}`
              : machine
                ? `${machine.platform} · signed-in user ${machine.result.username}`
                : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {s ? (
          <>
            <Detail label="Transport" value={s.transport} />
            <Detail label="Status" value={s.status} />
            <Detail label={s.url ? "URL" : "Command"} value={s.url ?? [s.command, ...s.args].filter(Boolean).join(" ")} mono />
            <Detail label="Environment variables (names only)" value={s.env_var_names.join(", ")} mono />
            <Detail label="Config file" value={s.config_path} mono />
            <Detail label="Machine" value={`${s.hostname} (${s.platform})`} />
          </>
        ) : (
          machine && (
            <>
              <Detail label={`AI applications (${apps.length})`} value={apps.map((a) => `${a.name} (${a.detection ?? a.category})`).join(", ")} />
              <Detail label={`AI CLI tools (${clis.length})`} value={clis.map((t) => t.name).join(", ")} />
              <Detail
                label={`MCP servers (${machine.result.mcp_servers.length})`}
                value={machine.result.mcp_servers.map((x) => `${x.name} (${x.source_application})`).join(", ")}
              />
              {machine.result.errors.length > 0 && <Detail label="Scan warnings" value={machine.result.errors.join("\n")} mono />}
              <Detail label="Machine ID" value={machine.machineId} mono />
            </>
          )
        )}
        {machine && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Created = first seen (first reporter). Last modified = latest scan and who reported it.
            </p>
            <RecordMetadata
              createdBy={machine.createdByName}
              createdAt={machine.createdAt}
              updatedBy={machine.reportedByName}
              updatedAt={machine.scannedAt}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const cmd = (s: McpRow) => s.url ?? [s.command, ...s.args].filter(Boolean).join(" ");

export function ShadowAI() {
  const [origin, setOrigin] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [removing, setRemoving] = useState<MachineRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shadow AI"
        description="Discover AI apps, AI CLI tools and MCP servers running on your organization's machines and servers."
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <ScanThisComputer origin={origin} onScanned={load} />
      <DeployToComputers origin={origin} />
      <ScanServer origin={origin} />

      {stats && stats.machines === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Radar className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No machines scanned yet</p>
            <p className="text-sm text-muted-foreground">
              Scan this computer or a server. Its AI apps, AI CLI tools and MCP servers appear here.
            </p>
          </CardContent>
        </Card>
      )}
      {stats && stats.machines > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={Server} label="Machines scanned" value={stats.machines} />
          <Stat icon={Radar} label="MCP servers" value={stats.mcp} />
          <Stat icon={AppWindow} label="AI apps installed" value={stats.apps} />
          <Stat icon={Terminal} label="AI CLI tools" value={stats.clis} />
        </div>
      )}

      <Card className={cn(stats?.machines === 0 && "hidden")}>
        <CardContent className="pt-6">
          <Tabs defaultValue="mcp">
            <TabsList>
              <TabsTrigger value="mcp">MCP servers</TabsTrigger>
              <TabsTrigger value="machines">Machines</TabsTrigger>
              <TabsTrigger value="apps">AI apps</TabsTrigger>
              <TabsTrigger value="clis">AI CLI tools</TabsTrigger>
            </TabsList>
            <TabsContent value="mcp" className="mt-4">
              <InventoryTable
                kind="mcp"
                reloadKey={reloadKey}
                onStats={setStats}
                filters={["machine", "source", "transport", "platform"]}
                columns={["Server", "Machine", "Configured in", "Transport", "Command / URL", "Actions"]}
                empty="No MCP servers match."
                row={(s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.hostname}</TableCell>
                    <TableCell className="text-muted-foreground">{s.source_application}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.transport}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs" title={cmd(s)}>
                      {cmd(s)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowMenu label={s.name} onView={() => setViewing({ machineId: s.machineId, server: s })} />
                    </TableCell>
                  </TableRow>
                )}
              />
            </TabsContent>
            <TabsContent value="machines" className="mt-4">
              <InventoryTable
                kind="machines"
                reloadKey={reloadKey}
                onStats={setStats}
                filters={["platform"]}
                columns={["Machine", "Platform", "MCP servers", "AI apps", "AI CLIs", "Last scan", "Actions"]}
                empty="No machines match."
                row={(m) => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">{m.hostname}</TableCell>
                    <TableCell>{m.platform}</TableCell>
                    <TableCell className="tabular-nums">{m.mcp}</TableCell>
                    <TableCell className="tabular-nums">{m.apps}</TableCell>
                    <TableCell className="tabular-nums">{m.clis}</TableCell>
                    <TableCell>
                      <LocalTime value={m.scannedAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowMenu
                        label={m.hostname}
                        onView={() => setViewing({ machineId: m.machineId })}
                        onDelete={() => setRemoving(m)}
                      />
                    </TableCell>
                  </TableRow>
                )}
              />
            </TabsContent>
            <TabsContent value="apps" className="mt-4">
              <InventoryTable
                kind="apps"
                reloadKey={reloadKey}
                onStats={setStats}
                filters={["machine", "source", "platform"]}
                columns={["App", "Category", "Machine", "Detected by", "Actions"]}
                empty="No AI apps match."
                row={(a) => (
                  <TableRow key={a.key}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">{a.category}</TableCell>
                    <TableCell className="text-muted-foreground">{a.hostname}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs" title={a.path ?? ""}>
                      {a.path ?? a.detection ?? "—"}
                      {a.path && a.detection?.includes("·") && (
                        <div className="truncate font-sans text-muted-foreground" title={a.detection}>
                          {a.detection.split(" · ").slice(1).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowMenu label={a.name} onView={() => setViewing({ machineId: a.machineId })} />
                    </TableCell>
                  </TableRow>
                )}
              />
            </TabsContent>
            <TabsContent value="clis" className="mt-4">
              <InventoryTable
                kind="clis"
                reloadKey={reloadKey}
                onStats={setStats}
                filters={["machine", "platform"]}
                columns={["Tool", "Machine", "Path", "Actions"]}
                empty="No AI CLI tools match."
                row={(t) => (
                  <TableRow key={t.key}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{t.hostname}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs">{t.path ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <RowMenu label={t.name} onView={() => setViewing({ machineId: t.machineId })} />
                    </TableCell>
                  </TableRow>
                )}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <ViewDialog viewing={viewing} onClose={() => setViewing(null)} />

      <DeleteConfirmationModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        isLoading={deleting}
        title="Delete machine"
        itemName={removing?.hostname ?? ""}
        itemType="machine"
        onConfirm={async () => {
          if (!removing) return;
          setDeleting(true);
          try {
            await deleteMachineScan(removing.machineId);
            setRemoving(null);
            load();
          } catch (e) {
            errorToast(e instanceof Error ? e.message : "Could not delete the machine.");
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
