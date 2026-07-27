import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWalletInput } from "@/lib/wallets";

export async function GET() {
  try {
    const wallets = await prisma.wallet.findMany({
      include: {
        score: true,
        _count: {
          select: {
            transactions: true,
            trades: true,
          },
        },
      },
    });
    return NextResponse.json(wallets);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch wallets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseWalletInput(body);

    if (parsed.error || !parsed.data) {
      return NextResponse.json({ error: parsed.error || "Invalid input" }, { status: 400 });
    }

    const existingWallet = await prisma.wallet.findFirst({
      where: {
        address: parsed.data.address,
        chain: parsed.data.chain,
      },
    });

    if (existingWallet) {
      return NextResponse.json(
        { error: "That wallet is already being tracked on this chain." },
        { status: 409 }
      );
    }

    const wallet = await prisma.wallet.create({
      data: parsed.data,
    });
    return NextResponse.json(wallet, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create wallet" },
      { status: 500 }
    );
  }
}
