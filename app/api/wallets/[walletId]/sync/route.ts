import { NextResponse } from "next/server";
import { walletIngestionService } from "@/services/WalletIngestionService";

type RouteContext = {
  params: Promise<{ walletId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { walletId } = await context.params;
  const result = await walletIngestionService.syncWalletActivity(walletId);

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
  }

  if (result.status === "unsupported_chain" || result.status === "not_configured") {
    return NextResponse.json(
      { error: result.message, status: result.status },
      { status: 400 }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
