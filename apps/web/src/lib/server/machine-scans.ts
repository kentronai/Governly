import "server-only";
import { db, machineScans } from "@db";
import type { MachineScanResult } from "@/lib/shadow-ai";

/** Upsert: an upload replaces that machine's row. */
export async function saveMachineScan(
  tenantId: string,
  uploadedBy: string,
  result: MachineScanResult,
  reportedVia: string,
) {
  const values = {
    reportedVia,
    hostname: result.hostname,
    platform: result.platform,
    uploadedBy,
    result,
    scannedAt: new Date().toISOString(),
  };
  await db
    .insert(machineScans)
    .values({ tenantId, machineId: result.machine_id, createdBy: uploadedBy, ...values })
    .onConflictDoUpdate({ target: [machineScans.tenantId, machineScans.machineId], set: values });
}
