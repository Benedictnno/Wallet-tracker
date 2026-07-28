// Cron: Re-score all wallets
// Called by Vercel Cron or via GET /api/cron/score
// Protected by CRON_SECRET header

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { walletTrackerService } from "@/services/WalletTrackerService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


  const wallets = await prisma.wallet.findMany({
    select: { id: true, label: true },
  });

  let scored = 0;
  let failed = 0;

  for (const wallet of wallets) {
    try {
      await walletTrackerService.refreshWalletAnalysis(wallet.id);
      scored++;
    } catch (err) {
      console.error(`[Cron/Score] Failed to score wallet ${wallet.id}:`, err);
      failed++;
    }
  }

  console.log(`[Cron/Score] Scored ${scored}/${wallets.length} wallets. Failed: ${failed}.`);

  return NextResponse.json({
    success: true,
    scored,
    failed,
    total: wallets.length,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
