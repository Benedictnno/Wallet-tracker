import type { Trade, Token } from "@prisma/client";

export type WalletIntegrityResult = {
  integrityFlags: string[];
  integrityPenalty: number;
};

export class WalletIntegrityService {
  analyze(
    trades: (Pick<Trade, "roi" | "profitLoss" | "tokenId"> & { token: Pick<Token, "symbol"> })[]
  ): WalletIntegrityResult {
    if (trades.length === 0) {
      return { integrityFlags: [], integrityPenalty: 0 };
    }

    const flags: string[] = [];
    let totalPenalty = 0;

    const closedTrades = trades.filter((t) => t.roi != null);
    
    // Check 1: Single Token Dependency
    if (closedTrades.length > 3) {
      const totalProfit = closedTrades.reduce((sum, t) => sum + Math.max(0, t.profitLoss ?? 0), 0);
      if (totalProfit > 0) {
        const profitsByToken = new Map<string, number>();
        for (const t of closedTrades) {
            profitsByToken.set(t.tokenId, (profitsByToken.get(t.tokenId) ?? 0) + Math.max(0, t.profitLoss ?? 0));
        }
        
        let maxTokenProfit = 0;
        let maxTokenSymbol = "";
        for (const [tokenId, profit] of profitsByToken.entries()) {
            if (profit > maxTokenProfit) {
                maxTokenProfit = profit;
                maxTokenSymbol = closedTrades.find(t => t.tokenId === tokenId)?.token.symbol ?? "";
            }
        }

        if (maxTokenProfit / totalProfit > 0.85) { // 85% of profits from a single token
            flags.push(`single_token_dependency (${maxTokenSymbol})`);
            totalPenalty += 20; // Heavy penalty - they might just be a deployer or lucky once
        }
      }
    }

    // Check 2: Fresh Wallet Lucky Streak
    if (closedTrades.length > 0 && closedTrades.length <= 5) {
       const winRate = closedTrades.filter((t) => (t.roi ?? 0) > 0).length / closedTrades.length;
       const avgRoi = closedTrades.reduce((sum, t) => sum + (t.roi ?? 0), 0) / closedTrades.length;

       if (winRate === 1 && avgRoi > 100) {
           flags.push("fresh_wallet_insider_streak");
           totalPenalty += 30; // Highly suspicious.
       }
    }

    // Since we don't have on-chain historical deployer tracking implemented locally yet,
    // we would ideally compare walletAddress == token.deployer.
    // For now, this placeholder handles the core logic outlined in the plan.

    return {
      integrityFlags: flags,
      integrityPenalty: Math.min(100, totalPenalty),
    };
  }
}

export const walletIntegrityService = new WalletIntegrityService();
