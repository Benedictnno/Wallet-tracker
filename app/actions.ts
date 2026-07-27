"use server";

import { revalidatePath } from "next/cache";
import { walletDiscoveryService } from "@/services/WalletDiscoveryService";

export async function runDiscoveryAction() {
  try {
    const { discovered, processed } = await walletDiscoveryService.runDiscovery(3, 3);
    const pruned = await walletDiscoveryService.pruneLowScoringWallets(15);

    revalidatePath("/");

    return { success: true, discovered, processed, pruned };
  } catch (error: any) {
    console.error("[RunDiscoveryAction] Error:", error);
    return { success: false, error: error?.message || "Failed to run discovery" };
  }
}

export async function getExecutionModeAction() {
  // Check if we have the private key or mnemonic for live trading
  const hasPrivateKey = !!process.env.SOLANA_PRIVATE_KEY;
  const hasMnemonic = !!process.env.SOLANA_MNEMONIC;
  
  if (hasPrivateKey || hasMnemonic) {
    return { mode: "LIVE" as const, message: "Live On-Chain Execution Active" };
  } else {
    return { mode: "PAPER" as const, message: "Paper Trading (Simulated) Active" };
  }
}
