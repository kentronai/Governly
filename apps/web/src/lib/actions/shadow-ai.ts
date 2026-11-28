"use server";

/** Shadow AI: AI apps, AI CLI tools and MCP servers found on the tenant's machines. */

import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, like } from "drizzle-orm";
import {
  auditEvents,
  db,
  machineScans,
  shadowAiDaily,
  shadowAiTools,
  users,
} from "@db";
import { createAuditEvent } from "@/lib/server/audit";
import { defaultRisk, toolsInScan } from "@/lib/server/shadow-ai-governance";
import { requireActiveTenant } from "@/lib/server/tenant-access";
import { saveMachineScan } from "@/lib/server/machine-scans";
import { createApiKey } from "@/lib/actions/api-keys";
import {
  deviceKey,
  MachineScanSchema,
  SHADOW_AI_SCAN_PERMISSION,
  SHADOW_AI_STATUSES,
  STATUS_LABEL,
  type LogUsage,
  type MachineScanResult,
  type ScanMcpServer,
  type ShadowAiStatus,
} from "@/lib/shadow-ai";

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

type Base = {
  key: string;
  machineId: string;
  hostname: string;
  platform: string;
  scannedAt: string;
};
export type MachineRow = Base & {
  username: string;
  mcp: number;
  apps: number;
  clis: number;
};
export type McpRow = Base & ScanMcpServer;
export type AppRow = Base & {
  name: string;
  category: string;
  detection: string | null;
  path: string | null;
};
export type CliRow = Base & { name: string; path: string | null };
type RowOf = { machines: MachineRow; mcp: McpRow; apps: AppRow; clis: CliRow };

function flatten(
  kind: ShadowAiKind,
  machines: Awaited<ReturnType<typeof loadMachines>>,
) {
  return machines.flatMap((m): (MachineRow | McpRow | AppRow | CliRow)[] => {
    const base = {
      machineId: m.machineId,
      hostname: m.hostname,
      platform: m.platform,
      scannedAt: m.scannedAt,
    };
    const apps = m.result.applications.filter((a) => a.status === "installed");
    const clis = m.result.cli_tools.filter((t) => t.installed);
    if (kind === "machines")
      return [
        {
          ...base,
          key: m.machineId,
          username: m.result.username,
          mcp: m.result.mcp_servers.length,
          apps: apps.length,
          clis: clis.length,
        },
      ];
    if (kind === "mcp")
      return m.result.mcp_servers.map((s, i) => ({
        ...base,
        ...s,
        key: `${m.machineId}:${i}`,
      }));
    if (kind === "apps")
      return apps.map((a, i) => ({
        ...base,
        key: `${m.machineId}:${i}`,
        name: a.name,
        category: a.category,
        detection: a.detection,
        path: a.path,
      }));
    return clis.map((t, i) => ({
      ...base,
      key: `${m.machineId}:${i}`,
      name: t.name,
      path: t.path,
    }));
  });
}

const uniq = (xs: string[]) =>
  [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** One filtered page of a Shadow AI table, plus the filter options and page-wide stats. */
export async function queryShadowAi<K extends ShadowAiKind>(
  kind: K,
  query: ShadowAiQuery,
) {
  const { tenantId } = await requireActiveTenant();
  const machines = await loadMachines(tenantId);
  const all = flatten(kind, machines) as RowOf[K][];
  const q = query.q?.trim().toLowerCase();
  const rows = all.filter((r) => {
    const s = r as Partial<McpRow & AppRow>;
    if (query.machine && r.machineId !== query.machine) return false;
    if (query.platform && r.platform !== query.platform) return false;
    if (query.source && (s.source_application ?? s.category) !== query.source)
      return false;
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
      machines: machines.map((m) => ({
        value: m.machineId,
        label: m.hostname,
      })),
      platforms: uniq(machines.map((m) => m.platform)),
      sources:
        kind === "apps"
          ? uniq(apps.map((a) => a.category))
          : uniq(mcp.map((s) => s.source_application)),
      transports: uniq(mcp.map((s) => s.transport)),
    },
    stats: {
      machines: machines.length,
      mcp: mcp.length,
      apps: apps.length,
      clis: machines.reduce(
        (n, m) => n + m.result.cli_tools.filter((t) => t.installed).length,
        0,
      ),
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
    .where(
      and(
        eq(machineScans.tenantId, tenantId),
        eq(machineScans.machineId, machineId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Machine not found.");
  const ids = [row.createdBy, row.uploadedBy].filter((x): x is string => !!x);
  const people = ids.length
    ? await db.select().from(users).where(inArray(users.id, ids))
    : [];
  const nameOf = (id: string | null) => {
    const u = people.find((p) => p.id === id);
    return (
      u?.name ||
      [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
      u?.email ||
      id ||
      "Unknown"
    );
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
  await saveMachineScan(
    tenantId,
    userId,
    MachineScanSchema.parse(input),
    "browser",
  );
}

export async function deleteMachineScan(machineId: string) {
  const { tenantId } = await requireActiveTenant();
  await db
    .delete(machineScans)
    .where(
      and(
        eq(machineScans.tenantId, tenantId),
        eq(machineScans.machineId, machineId),
      ),
    );
}

/**
 * A scan-only API key for servers without a browser. It shows up (and can be
 * revoked) on the API Keys page like any other key.
 */
export async function createScanKey(
  purpose: "server" | "jamf" | "windows" = "server",
) {
  const { tenantId } = await requireActiveTenant();
  // A fleet key lives on every managed computer, so it gets a year instead of 90 days.
  const days = purpose === "server" ? 90 : 365;
  const expiresAt = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const key = await createApiKey({
    tenantId,
    name: {
      server: "Shadow AI server scan",
      jamf: "Shadow AI Jamf fleet",
      windows: "Shadow AI Windows fleet",
    }[purpose],
    permissions: [SHADOW_AI_SCAN_PERMISSION],
    expiresAt,
  });
  return { token: key.plainKey, expiresAt };
}

// --- Governance: labels, risk, blocking, trends, audit trail, log import -----------------

export type ShadowAiToolRow = {
  name: string;
  category: string;
  status: ShadowAiStatus;
  statusReason: string | null;
  risk: number;
  riskBasis: string;
  riskOverridden: boolean;
  alternative: string | null;
  blockedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  machines: number;
  users: number;
};

/** Every AI tool the tenant has seen, with its label, risk and current reach. */
export async function listShadowAiTools(): Promise<ShadowAiToolRow[]> {
  const { tenantId } = await requireActiveTenant();
  const [tools, machines] = await Promise.all([
    db.select().from(shadowAiTools).where(eq(shadowAiTools.tenantId, tenantId)),
    loadMachines(tenantId),
  ]);
  const reach = new Map<string, { machines: number; users: Set<string> }>();
  for (const m of machines)
    for (const name of toolsInScan(m.result).keys()) {
      const r = reach.get(name) ?? { machines: 0, users: new Set<string>() };
      r.machines += 1;
      r.users.add(m.result.username || m.hostname);
      reach.set(name, r);
    }
  return tools
    .map((t) => {
      const base = defaultRisk(t.name, t.category);
      const overridden = t.riskOverride !== null;
      return {
        name: t.name,
        category: t.category,
        status: t.status as ShadowAiStatus,
        statusReason: t.statusReason,
        risk: overridden ? t.riskOverride! : base.score,
        riskBasis: overridden ? `Set by admin: ${t.riskReason}` : base.basis,
        riskOverridden: overridden,
        alternative: t.alternative,
        blockedAt: t.blockedAt,
        firstSeenAt: t.firstSeenAt,
        lastSeenAt: t.lastSeenAt,
        machines: reach.get(t.name)?.machines ?? 0,
        users: reach.get(t.name)?.users.size ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.risk - a.risk ||
        b.machines - a.machines ||
        a.name.localeCompare(b.name),
    );
}

const ToolChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    status: z.enum(SHADOW_AI_STATUSES),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    kind: z.literal("risk"),
    score: z.number().int().min(0).max(100).nullable(),
    reason: z.string().trim().max(1000),
  }),
  z.object({
    kind: z.literal("block"),
    alternative: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(1000).optional(),
  }),
  z.object({
    kind: z.literal("unblock"),
    reason: z.string().trim().max(1000).optional(),
  }),
]);
export type ShadowAiToolChange = z.infer<typeof ToolChangeSchema>;

/** Label, re-score, block or unblock one tool. Every change is written to the audit trail. */
export async function updateShadowAiTool(
  name: string,
  input: ShadowAiToolChange,
) {
  const { tenantId, userId } = await requireActiveTenant();
  const change = ToolChangeSchema.parse(input);
  const where = and(
    eq(shadowAiTools.tenantId, tenantId),
    eq(shadowAiTools.name, name),
  );
  const [tool] = await db.select().from(shadowAiTools).where(where).limit(1);
  if (!tool) throw new Error("Tool not found.");
  const now = new Date().toISOString();
  let set: Partial<typeof shadowAiTools.$inferInsert>;
  let message: string;
  if (change.kind === "status") {
    // Sanctioning or tolerating a tool lifts its block; marking it unsanctioned doesn't block by itself.
    const lift =
      change.status === "sanctioned" || change.status === "tolerated";
    set = {
      status: change.status,
      statusReason: change.reason || null,
      ...(lift && { blockedAt: null }),
    };
    message = `${name}: ${STATUS_LABEL[tool.status as ShadowAiStatus]} → ${STATUS_LABEL[change.status]}`;
  } else if (change.kind === "risk") {
    if (change.score !== null && !change.reason)
      throw new Error("A reason is required to override the risk score.");
    set = {
      riskOverride: change.score,
      riskReason: change.score === null ? null : change.reason,
    };
    message =
      change.score === null
        ? `${name}: risk reset to default`
        : `${name}: risk set to ${change.score}`;
  } else if (change.kind === "block") {
    set = {
      status: "unsanctioned",
      blockedAt: now,
      alternative: change.alternative || null,
      statusReason: change.reason || null,
    };
    message = `${name}: blocked${change.alternative ? `, use ${change.alternative} instead` : ""}`;
  } else {
    set = { blockedAt: null, statusReason: change.reason || null };
    message = `${name}: unblocked`;
  }
  await db
    .update(shadowAiTools)
    .set({ ...set, updatedAt: now })
    .where(where);
  await createAuditEvent({
    tenantId,
    actorUserId: userId,
    action: `shadow_ai.${change.kind === "status" ? "status_changed" : change.kind === "risk" ? "risk_overridden" : change.kind === "block" ? "blocked" : "unblocked"}`,
    targetType: "shadow_ai_tool",
    targetId: name,
    metadata: { ...change, previous_status: tool.status },
    message,
  });
}

/** Machines per tool per day for the last `days` days, for the trends chart. */
export async function getShadowAiTrends(days = 30) {
  const { tenantId } = await requireActiveTenant();
  const since = new Date(Date.now() - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = await db
    .select()
    .from(shadowAiDaily)
    .where(
      and(eq(shadowAiDaily.tenantId, tenantId), gte(shadowAiDaily.day, since)),
    )
    .orderBy(asc(shadowAiDaily.day));
  const byTool = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const series = byTool.get(r.name) ?? new Map<string, number>();
    series.set(r.day, r.machines);
    byTool.set(r.name, series);
  }
  const dayList = [...new Set(rows.map((r) => r.day))];
  const tools = [...byTool].map(([name, series]) => {
    const first = series.get(dayList[0]) ?? 0;
    const last = series.get(dayList[dayList.length - 1]) ?? 0;
    return { name, first, last, change: last - first };
  });
  return {
    days: dayList,
    series: Object.fromEntries(
      [...byTool].map(([n, s]) => [n, Object.fromEntries(s)]),
    ),
    tools,
  };
}

/** The Shadow AI audit trail (detections, label changes, blocks), newest first. */
export async function getShadowAiActivity(limit = 200) {
  const { tenantId } = await requireActiveTenant();
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      tool: auditEvents.targetId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actor: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        like(auditEvents.action, "shadow_ai.%"),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(Math.min(limit, 1000));
  return rows.map((r) => ({
    ...r,
    message: String((r.metadata as { message?: string })?.message ?? ""),
  }));
}

const LogImportSchema = z.object({
  source: z.string().trim().min(1).max(80),
  usage: z
    .array(
      z.object({
        user: z.string().trim().min(1).max(256),
        tools: z
          .array(
            z.object({
              name: z.string().max(256),
              hits: z.number().int().min(0),
            }),
          )
          .max(200),
      }),
    )
    .max(20_000),
});

/** Company laptops (scanned by Governly) whose traffic a proxy/DNS log import may match. */
export async function listCompanyDevices() {
  const { tenantId } = await requireActiveTenant();
  return (await loadMachines(tenantId))
    .filter((m) => !m.machineId.startsWith("log:"))
    .map((m) => m.hostname);
}

/**
 * Proxy/DNS log import (Zscaler, Netskope, Umbrella, ...), parsed in the browser by parseAiUsageLog,
 * which keeps only lines from company laptops. Findings are added to that laptop's own record, so
 * it isn't counted twice and nothing about other devices on the network is stored.
 */
export async function importAiUsageLog(input: {
  source: string;
  usage: LogUsage[];
}) {
  const { tenantId, userId } = await requireActiveTenant();
  const { source, usage } = LogImportSchema.parse(input);
  const machines = (await loadMachines(tenantId)).filter(
    (m) => !m.machineId.startsWith("log:"),
  );
  let devices = 0;
  for (const u of usage) {
    const m = machines.find((x) => deviceKey(x.hostname) === u.user);
    if (!m) continue; // ponytail: the browser already filtered; this just refuses anything else.
    devices += 1;
    const found = new Map(u.tools.map((t) => [t.name, t.hits]));
    await saveMachineScan(
      tenantId,
      userId,
      {
        ...m.result,
        applications: [
          ...m.result.applications.filter((a) => !found.has(a.name)),
          ...u.tools.map((t) => ({
            name: t.name,
            category: "AI website",
            status: "installed" as const,
            detection: `${source} log · ${t.hits} requests`,
            path: null,
          })),
        ],
      },
      `${source} log import`,
    );
  }
  return {
    users: devices,
    tools: new Set(usage.flatMap((u) => u.tools.map((t) => t.name))).size,
  };
}
