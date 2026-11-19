"use server";

/** Shadow AI: AI apps, AI CLI tools and MCP servers found on the tenant's machines. */

import { and, asc, eq } from "drizzle-orm";
import { db, machineScans } from "@db";
import { requireActiveTenant } from "@/lib/server/tenant-access";
import { saveMachineScan } from "@/lib/server/machine-scans";
import { createApiKey } from "@/lib/actions/api-keys";
import { MachineScanSchema, SHADOW_AI_SCAN_PERMISSION, type MachineScanResult } from "@/lib/shadow-ai";

export async function listMachineScans() {
  const { tenantId } = await requireActiveTenant();
  const rows = await db
    .select()
    .from(machineScans)
    .where(eq(machineScans.tenantId, tenantId))
    .orderBy(asc(machineScans.hostname));
  return rows.map((r) => ({ ...r, result: r.result as MachineScanResult }));
}

/** Saves a scan the browser fetched from the scan helper on this computer. */
export async function saveBrowserScan(input: unknown) {
  const { tenantId, userId } = await requireActiveTenant();
  await saveMachineScan(tenantId, userId, MachineScanSchema.parse(input));
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
