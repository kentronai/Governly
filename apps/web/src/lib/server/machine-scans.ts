import "server-only";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { apiKeys, db, machineScans } from "@db";
import { SHADOW_AI_SCAN_PERMISSION, type MachineScanResult } from "@/lib/shadow-ai";
import { syncShadowAiTools, toolsInScan } from "@/lib/server/shadow-ai-governance";

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
  await syncShadowAiTools(tenantId, uploadedBy, toolsInScan(result));
}

/** The active, unexpired scan-only API key in the request's Bearer header, else null. */
export async function scanKeyFor(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .limit(1);
  if (!key || !key.permissions.includes(SHADOW_AI_SCAN_PERMISSION)) return null;
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;
  return key;
}
