import { db } from "@db";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Web health check failed:", error);
    return NextResponse.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
