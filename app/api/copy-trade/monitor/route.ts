import { NextResponse } from "next/server";
import { positionMonitorService } from "@/services/trade/PositionMonitorService";

export async function GET() {
  try {
    const evaluations = await positionMonitorService.evaluatePositions();
    return NextResponse.json({
      success: true,
      evaluatedCount: evaluations.length,
      actionsTaken: evaluations.filter(e => e.actionTaken !== "NONE"),
      evaluations,
    });
  } catch (error: any) {
    console.error("[API copy-trade/monitor] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to evaluate positions" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
