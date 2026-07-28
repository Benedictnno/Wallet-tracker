// Cron: Evaluate TP/SL positions
// Called by Vercel Cron every 5 minutes or via GET /api/cron/monitor
// Protected by CRON_SECRET header

import { NextRequest, NextResponse } from "next/server";
import { positionMonitorService } from "@/services/trade/PositionMonitorService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const evaluations = await positionMonitorService.evaluatePositions();
    const actionsTaken = evaluations.filter((e) => e.actionTaken !== "NONE");

    console.log(`[Cron/Monitor] Evaluated ${evaluations.length} positions. Actions taken: ${actionsTaken.length}`);

    return NextResponse.json({
      success: true,
      evaluatedCount: evaluations.length,
      actionsTakenCount: actionsTaken.length,
      actionsTaken,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Cron/Monitor] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to evaluate positions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
