"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Apple, AppWindow, Download, Eye, Monitor, Radar, RefreshCcw, Server, Terminal, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LocalTime } from "@/components/common/LocalTime";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
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
  listMachineScans,
  saveBrowserScan,
} from "@/lib/actions/shadow-ai";
import type { MachineScanResult } from "@/lib/shadow-ai";

type Machine = Awaited<ReturnType<typeof listMachineScans>>[number];

/** The local helper installed by shadow-ai-scan.py --install (loopback only, answers only trusted origins). */
const HELPER_SCAN_URL = "http://127.0.0.1:8766/scan";

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

/** The page cannot read the disk, so it asks the local helper; until it answers, show the one-time install. */
function ScanThisComputer({ origin, onScanned }: { origin: string; onScanned: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [helperMissing, setHelperMissing] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      let result: MachineScanResult;
      try {
        result = await fetchHelperScan();
      } catch {
        setHelperMissing(true); // not installed, not running, or browser prompt declined
        return;
      }
      setHelperMissing(false);
      await saveBrowserScan(result);
      infoToast("This computer was scanned.");
      onScanned();
    } catch (e) {
      errorToast(e instanceof Error ? e.message : "Could not save the scan.");
    } finally {
      setScanning(false);
    }
  }, [onScanned]);

  // While setup is on screen, scan the moment the helper starts answering.
  useEffect(() => {
    if (!helperMissing || scanning) return;
    const timer = setInterval(() => {
      fetchHelperScan()
        .then(() => {
          clearInterval(timer);
          void scan();
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [helperMissing, scanning, scan]);

  const [showSetup, setShowSetup] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  useEffect(() => setIsWindows(/Win/i.test(navigator.userAgent)), []);
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
        <Button onClick={scan} disabled={scanning}>
          <Radar className="mr-2 h-4 w-4" />
          {scanning ? "Scanning…" : "Scan this computer"}
        </Button>
      </CardHeader>
      <CardContent>
        {helperMissing || showSetup ? (
          <>
            <p className="text-sm font-medium">One-time setup for this computer</p>
            <p className="text-sm text-muted-foreground">
              A website cannot read your files, so Governly uses a small read-only helper. Run the
              command for your system once; if your browser asks to access devices on your local
              network, click Allow. The scan then starts by itself.
            </p>
            <Tabs defaultValue={isWindows ? "windows" : "unix"} className="mt-3">
              <TabsList>
                <TabsTrigger value="unix">macOS / Linux (Terminal)</TabsTrigger>
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
            {helperMissing && <p className="mt-3 text-xs text-muted-foreground">Waiting for the helper…</p>}
          </>
        ) : (
          <Button variant="link" className="h-auto p-0" onClick={() => setShowSetup(true)}>
            Set up manually (macOS, Linux or Windows)
          </Button>
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
                  Add it to a policy scoped to your Macs. Each Mac scans itself at login and daily, and
                  appears below. Employees don&apos;t need to do anything.
                </Step>
              </ol>
              <p className="text-xs text-muted-foreground">
                Each download creates a scan-only key, valid for a year, listed on the API Keys page as
                &quot;Shadow AI Jamf fleet&quot;. Revoke it there to stop those Macs reporting.
              </p>
            </section>

            <section className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">A single Mac, manually</p>
              <p className="text-sm text-muted-foreground">
                Run this once in Terminal on the Mac, then click Scan this computer on that Mac.
                Requires Python 3.
              </p>
              <CommandBlock command={unix} />
            </section>
          </TabsContent>

          <TabsContent value="windows" className="mt-4 space-y-3">
            <p className="text-sm font-medium">A Windows computer, manually</p>
            <ol className="space-y-3 text-sm">
              <Step n={1}>
                Install Python 3 from{" "}
                <a href="https://www.python.org/downloads/windows/" target="_blank" rel="noreferrer" className="underline">
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
      <p className={mono ? "break-all font-mono text-xs" : "text-sm"}>{value || "—"}</p>
    </div>
  );
}

const installedApps = (m: Machine) => m.result.applications.filter((a) => a.status === "installed");
const installedClis = (m: Machine) => m.result.cli_tools.filter((t) => t.installed);

export function ShadowAI({ initialMachines }: { initialMachines: Machine[] }) {
  const [machines, setMachines] = useState(initialMachines);
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState<Machine | null>(null);
  const [removing, setRemoving] = useState<Machine | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(() => {
    listMachineScans()
      .then(setMachines)
      .catch((e) => errorToast(e instanceof Error ? e.message : "Could not load scans."));
  }, []);

  const servers = useMemo(
    () => machines.flatMap((m) => m.result.mcp_servers.map((s, i) => ({ ...s, hostname: m.hostname, key: `${m.machineId}:${i}` }))),
    [machines],
  );

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

      {machines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Radar className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No machines scanned yet</p>
            <p className="text-sm text-muted-foreground">
              Scan this computer or a server. Its AI apps, AI CLI tools and MCP servers appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={Server} label="Machines scanned" value={machines.length} />
            <Stat icon={Radar} label="MCP servers" value={servers.length} />
            <Stat icon={AppWindow} label="AI apps installed" value={machines.reduce((n, m) => n + installedApps(m).length, 0)} />
            <Stat icon={Terminal} label="AI CLI tools" value={machines.reduce((n, m) => n + installedClis(m).length, 0)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">MCP servers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Server</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Configured in</TableHead>
                    <TableHead>Transport</TableHead>
                    <TableHead>Command / URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No MCP servers found on the scanned machines.
                      </TableCell>
                    </TableRow>
                  ) : (
                    servers.map((s) => (
                      <TableRow key={s.key}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.hostname}</TableCell>
                        <TableCell className="text-muted-foreground">{s.source_application}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{s.transport}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate font-mono text-xs" title={s.url ?? [s.command, ...s.args].join(" ")}>
                          {s.url ?? [s.command, ...s.args].filter(Boolean).join(" ")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Machines</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>MCP servers</TableHead>
                    <TableHead>AI apps</TableHead>
                    <TableHead>AI CLIs</TableHead>
                    <TableHead>Last scan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {machines.map((m) => (
                    <TableRow key={m.machineId}>
                      <TableCell className="font-medium">{m.hostname}</TableCell>
                      <TableCell>{m.platform}</TableCell>
                      <TableCell className="tabular-nums">{m.result.mcp_servers.length}</TableCell>
                      <TableCell className="tabular-nums">{installedApps(m).length}</TableCell>
                      <TableCell className="tabular-nums">{installedClis(m).length}</TableCell>
                      <TableCell>
                        <LocalTime value={m.scannedAt} />
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button variant="ghost" size="icon" aria-label={`View ${m.hostname}`} onClick={() => setSelected(m)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${m.hostname}`} onClick={() => setRemoving(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.hostname}</DialogTitle>
                <DialogDescription>
                  {selected.platform} · scanned as {selected.result.username}
                </DialogDescription>
              </DialogHeader>
              <Detail
                label={`AI applications (${installedApps(selected).length})`}
                value={installedApps(selected).map((a) => `${a.name} (${a.detection ?? a.category})`).join(", ")}
              />
              <Detail label={`AI CLI tools (${installedClis(selected).length})`} value={installedClis(selected).map((t) => t.name).join(", ")} />
              <Detail
                label={`MCP servers (${selected.result.mcp_servers.length})`}
                value={selected.result.mcp_servers.map((s) => `${s.name} (${s.source_application})`).join(", ")}
              />
              {selected.result.errors.length > 0 && <Detail label="Scan warnings" value={selected.result.errors.join("\n")} mono />}
              <Detail label="Machine ID" value={selected.machineId} mono />
            </>
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmationModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        isLoading={deleting}
        title="Remove machine"
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
            errorToast(e instanceof Error ? e.message : "Could not remove the machine.");
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}
