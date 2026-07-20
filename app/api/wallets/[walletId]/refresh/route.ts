import { NextResponse } from "next/server";
import { walletTrackerService } from "@/services/WalletTrackerService";

type RouteContext = {
  params: Promise<{ walletId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { walletId } = await context.params;
  const result = await walletTrackerService.refreshWalletAnalysis(walletId);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }

  if (result.status === "no_trades") {
    return NextResponse.json(
      {
        status: result.status,
        message: "This wallet has no completed trades to score yet.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
