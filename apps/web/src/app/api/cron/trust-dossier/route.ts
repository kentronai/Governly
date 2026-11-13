import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  TrustDossierBusyError,
  TrustDossierNoKeyError,
  isTrustDossierDue,
  startTrustDossierRun,
} from "@/lib/server/trust-dossier/agent";

// Same machine-to-machine auth as /api/cron/agent-discovery.
function authorized(request: NextRequest): boolean {
  const expected =
    process.env.AGENT_DISCOVERY_CRON_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Polled hourly by the scheduler container; the run itself is gated to Saturday
 * 02:00 UTC onwards, once a week. `?force=1` skips the gate.
 */
async function run(request: NextRequest) {
  if (!process.env.AGENT_DISCOVERY_CRON_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron secret is not configured" },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !(await isTrustDossierDue())) {
    return NextResponse.json({ status: "not_due" });
  }
  try {
    const { runId } = await startTrustDossierRun({ trigger: "cron" });
    return NextResponse.json({ status: "started", runId }, { status: 202 });
  } catch (error) {
    if (error instanceof TrustDossierBusyError) {
      return NextResponse.json({ status: "already_running" }, { status: 409 });
    }
    if (error instanceof TrustDossierNoKeyError) {
      return NextResponse.json({ status: "no_key", error: error.message }, { status: 200 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trust Dossier agent failed to start" },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
