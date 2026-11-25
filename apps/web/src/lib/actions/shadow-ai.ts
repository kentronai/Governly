"use server";

/** Shadow AI: AI apps, AI CLI tools and MCP servers found on the tenant's machines. */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db, machineScans, users } from "@db";
import { requireActiveTenant } from "@/lib/server/tenant-access";
import { saveMachineScan } from "@/lib/server/machine-scans";
import { createApiKey } from "@/lib/actions/api-keys";
import { MachineScanSchema, SHADOW_AI_SCAN_PERMISSION, type MachineScanResult, type ScanMcpServer } from "@/lib/shadow-ai";

// ponytail: loads every machine row (1 row per machine, ~1k max) and filters/pages in Node, so the
// browser only ever receives one page. Move to SQL jsonb_array_elements if fleets grow past ~10k machines.
async function loadMachines(tenantId: string) {
  const rows = await db
    .select({
      machineId: machineScans.machineId,
      hostname: machineScans.hostname,
      platform: machineScans.platform,
      result: machineScans.result,
      scannedAt: machineScans.scannedAt,
    })
    .from(machineScans)
    .where(eq(machineScans.tenantId, tenantId))
    .orderBy(asc(machineScans.hostname));
  return rows.map((r) => ({ ...r, result: r.result as MachineScanResult }));
}

export type ShadowAiKind = "machines" | "mcp" | "apps" | "clis";
export type ShadowAiQuery = {
  q?: string;
  machine?: string;
  platform?: string;
  source?: string;
  transport?: string;
  page: number;
  pageSize: number;
};

type Base = { key: string; machineId: string; hostname: string; platform: string; scannedAt: string };
export type MachineRow = Base & { username: string; mcp: number; apps: number; clis: number };
export type McpRow = Base & ScanMcpServer;
export type AppRow = Base & { name: string; category: string; detection: string | null; path: string | null };
export type CliRow = Base & { name: string; path: string | null };
type RowOf = { machines: MachineRow; mcp: McpRow; apps: AppRow; clis: CliRow };

function flatten(kind: ShadowAiKind, machines: Awaited<ReturnType<typeof loadMachines>>) {
  return machines.flatMap((m): (MachineRow | McpRow | AppRow | CliRow)[] => {
    const base = { machineId: m.machineId, hostname: m.hostname, platform: m.platform, scannedAt: m.scannedAt };
    const apps = m.result.applications.filter((a) => a.status === "installed");
    const clis = m.result.cli_tools.filter((t) => t.installed);
    if (kind === "machines")
      return [{ ...base, key: m.machineId, username: m.result.username, mcp: m.result.mcp_servers.length, apps: apps.length, clis: clis.length }];
    if (kind === "mcp") return m.result.mcp_servers.map((s, i) => ({ ...base, ...s, key: `${m.machineId}:${i}` }));
    if (kind === "apps")
      return apps.map((a, i) => ({ ...base, key: `${m.machineId}:${i}`, name: a.name, category: a.category, detection: a.detection, path: a.path }));
    return clis.map((t, i) => ({ ...base, key: `${m.machineId}:${i}`, name: t.name, path: t.path }));
  });
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** One filtered page of a Shadow AI table, plus the filter options and page-wide stats. */
export async function queryShadowAi<K extends ShadowAiKind>(kind: K, query: ShadowAiQuery) {
  const { tenantId } = await requireActiveTenant();
  const machines = await loadMachines(tenantId);
  const all = flatten(kind, machines) as RowOf[K][];
  const q = query.q?.trim().toLowerCase();
  const rows = all.filter((r) => {
    const s = r as Partial<McpRow & AppRow>;
    if (query.machine && r.machineId !== query.machine) return false;
    if (query.platform && r.platform !== query.platform) return false;
    if (query.source && (s.source_application ?? s.category) !== query.source) return false;
    if (query.transport && s.transport !== query.transport) return false;
    return !q || JSON.stringify(r).toLowerCase().includes(q);
  });
  const pageSize = Math.min(Math.max(query.pageSize, 1), 200);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(query.page, 1), totalPages);
  const mcp = flatten("mcp", machines) as McpRow[];
  const apps = flatten("apps", machines) as AppRow[];
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    totalPages,
    facets: {
      machines: machines.map((m) => ({ value: m.machineId, label: m.hostname })),
      platforms: uniq(machines.map((m) => m.platform)),
      sources: kind === "apps" ? uniq(apps.map((a) => a.category)) : uniq(mcp.map((s) => s.source_application)),
      transports: uniq(mcp.map((s) => s.transport)),
    },
    stats: {
      machines: machines.length,
      mcp: mcp.length,
      apps: apps.length,
      clis: machines.reduce((n, m) => n + m.result.cli_tools.filter((t) => t.installed).length, 0),
    },
  };
}

function reporter(name: string, via: string | null) {
  if (!via) return name;
  if (via === "browser") return `${name} (Scan this computer)`;
  return `${via} key, issued by ${name}`;
}

/** Full scan of one machine plus who/when metadata for the View dialog. */
export async function getMachineScan(machineId: string) {
  const { tenantId } = await requireActiveTenant();
  const [row] = await db
    .select()
    .from(machineScans)
    .where(and(eq(machineScans.tenantId, tenantId), eq(machineScans.machineId, machineId)))
    .limit(1);
  if (!row) throw new Error("Machine not found.");
  const ids = [row.createdBy, row.uploadedBy].filter((x): x is string => !!x);
  const people = ids.length ? await db.select().from(users).where(inArray(users.id, ids)) : [];
  const nameOf = (id: string | null) => {
    const u = people.find((p) => p.id === id);
    return u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || id || "Unknown";
  };
  return {
    ...row,
    result: row.result as MachineScanResult,
    createdByName: nameOf(row.createdBy),
    reportedByName: reporter(nameOf(row.uploadedBy), row.reportedVia),
  };
}

/** Saves a scan the browser fetched from the scan helper on this computer. */
export async function saveBrowserScan(input: unknown) {
  const { tenantId, userId } = await requireActiveTenant();
  await saveMachineScan(tenantId, userId, MachineScanSchema.parse(input), "browser");
}

export async function deleteMachineScan(machineId: string) {
  const { tenantId } = await requireActiveTenant();
  await db
    .delete(machineScans)
    .where(and(eq(machineScans.tenantId, tenantId), eq(machineScans.machineId, machineId)));
}

/**
 * A scan-only API key for servers without a browser. It shows up (and can be
 * revoked) on the API Keys page like any other key.
 */
export async function createScanKey(purpose: "server" | "jamf" = "server") {
  const { tenantId } = await requireActiveTenant();
  // A Jamf fleet key lives in a configuration profile, so it gets a year instead of 90 days.
  const days = purpose === "jamf" ? 365 : 90;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const key = await createApiKey({
    tenantId,
    name: purpose === "jamf" ? "Shadow AI Jamf fleet" : "Shadow AI server scan",
    permissions: [SHADOW_AI_SCAN_PERMISSION],
    expiresAt,
  });
  return { token: key.plainKey, expiresAt };
}
