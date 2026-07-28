"use server";

import { jupiterTradeService } from "@/services/trade/JupiterTradeService";
import { Connection } from "@solana/web3.js";

export async function getBotWalletBalance() {
  try {
    const keypair = jupiterTradeService.getWalletFromEnv();
    
    if (!keypair) {
      return {
        success: false,
        error: "No wallet configured. Please set SOLANA_MNEMONIC in .env"
      };
    }

    if (!process.env.HELIUS_API_KEY) {
      return {
        success: false,
        error: "Missing HELIUS_API_KEY to fetch balance."
      };
    }

    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const connection = new Connection(rpcUrl, "confirmed");
    const balanceLamports = await connection.getBalance(keypair.publicKey);
    
    return {
      success: true,
      address: keypair.publicKey.toBase58(),
      balanceSol: balanceLamports / 1e9
    };
  } catch (error) {
    console.error("[getBotWalletBalance] Error fetching balance:", error);
    return {
      success: false,
      error: "Failed to fetch wallet balance"
    };
  }
}
