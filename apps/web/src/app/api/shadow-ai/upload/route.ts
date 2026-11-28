import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiKeys, db } from "@db";
import { saveMachineScan, scanKeyFor } from "@/lib/server/machine-scans";
import { blockedTools } from "@/lib/server/shadow-ai-governance";
import { MachineScanSchema } from "@/lib/shadow-ai";

/** Receives one machine's scan from shadow-ai-scan.py, authed by a scan-only API key. */

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const key = await scanKeyFor(request);
  if (!key) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = MachineScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_scan" }, { status: 400 });
  }

  await saveMachineScan(key.tenantId, key.createdBy, parsed.data, key.name);
  await db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, key.id));
  // The scanner enforces this right after uploading (closes blocked apps on the device).
  return NextResponse.json({ ok: true, blocked: await blockedTools(key.tenantId) });
}
