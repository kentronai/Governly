"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppWindow, Eye, Radar, RefreshCcw, Server, Terminal, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LocalTime } from "@/components/common/LocalTime";
import { DeleteConfirmationModal } from "@/components/common/DeleteConfirmationModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  // ponytail: macOS/Linux only; a Windows .bat installer can come over from Receipt if customers need it.
  const command =
    `mkdir -p ~/.governly && curl -fsSL ${origin}/shadow-ai-scan.py -o ~/.governly/shadow-ai-scan.py && ` +
    `python3 ~/.governly/shadow-ai-scan.py --install --allow-origin ${origin}`;

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
      {helperMissing && (
        <CardContent>
          <p className="text-sm font-medium">One-time setup for this computer</p>
          <p className="text-sm text-muted-foreground">
            A website cannot read your files, so Governly uses a small read-only helper. Paste this
            into Terminal once; if your browser asks to access devices on your local network, click
            Allow. The scan then starts by itself.
          </p>
          <CommandBlock command={command} />
          <p className="mt-3 text-xs text-muted-foreground">Waiting for the helper…</p>
        </CardContent>
      )}
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
            <CommandBlock command={command} />
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

/** Fleet rollout: Jamf pushes the .pkg plus a configuration profile carrying the Governly URL and key. */
function DeployWithJamf({ origin }: { origin: string }) {
  const [key, setKey] = useState<{ token: string; expiresAt: string } | null>(null);
  const profile = key
    ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>url</key><string>${origin}</string>
  <key>token</key><string>${key.token}</string>
</dict>
</plist>`
    : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deploy to all Macs with Jamf</CardTitle>
        <CardDescription>
          Every Mac scans itself at login and daily, with nothing for employees to click. No Python
          needed on the Macs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <Button variant="outline" size="sm" asChild>
              <a href="/downloads/Governly-ShadowAI.pkg" download>
                Download Governly-ShadowAI.pkg
              </a>
            </Button>{" "}
            and upload it in Jamf Pro under Settings &gt; Computer management &gt; Packages.
          </li>
          <li>
            Create a configuration profile with Application &amp; Custom Settings &gt; Upload,
            preference domain <code className="font-mono text-xs">ai.kentron.shadow-ai</code>, and
            paste this property list:
            {key ? (
              <>
                <CommandBlock command={profile} />
                <p className="mt-2 text-xs text-muted-foreground">
                  The key can only upload scans, expires <LocalTime value={key.expiresAt} mode="date" />,
                  and can be revoked on the API Keys page.
                </p>
              </>
            ) : (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    createScanKey("jamf")
                      .then(setKey)
                      .catch((e) => errorToast(e instanceof Error ? e.message : "Could not create a key."))
                  }
                >
                  Create key and property list
                </Button>
              </div>
            )}
          </li>
          <li>Scope the profile and a policy installing the package to your Macs. They appear below after their first scan.</li>
        </ol>
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
      <DeployWithJamf origin={origin} />
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
