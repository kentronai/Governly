import crypto from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { apiKeys, db } from "@db";
import { saveMachineScan } from "@/lib/server/machine-scans";
import { MachineScanSchema, SHADOW_AI_SCAN_PERMISSION } from "@/lib/shadow-ai";

/** Receives one machine's scan from shadow-ai-scan.py, authed by a scan-only API key. */

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .limit(1);
  if (
    !key ||
    !key.permissions.includes(SHADOW_AI_SCAN_PERMISSION) ||
    (key.expiresAt && new Date(key.expiresAt) < new Date())
  ) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

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
  return NextResponse.json({ ok: true });
}
