import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers, uptime checks, and Docker healthchecks. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
}
