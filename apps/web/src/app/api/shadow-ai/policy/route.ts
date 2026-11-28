import { NextResponse } from "next/server";
import { scanKeyFor } from "@/lib/server/machine-scans";
import { blockedTools } from "@/lib/server/shadow-ai-governance";

/** Blocked AI tools for the scan helper to enforce on the device, authed by the scan-only key. */
export async function GET(request: Request) {
  const key = await scanKeyFor(request);
  if (!key) return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  return NextResponse.json({ ok: true, blocked: await blockedTools(key.tenantId) });
}
