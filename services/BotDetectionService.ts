import type { Trade, Transaction } from "@prisma/client";

export type BotDetectionResult = {
  isSuspectedBot: boolean;
  botType: "MEV" | "ARBITRAGE" | "SANDWICH" | "SNIPER" | "HIGH_FREQUENCY" | null;
  botConfidence: number; // 0 to 1
};

export class BotDetectionService {
  analyze(
    transactions: Pick<Transaction, "timestamp" | "source" | "type" | "description">[],
    trades: Pick<Trade, "roi" | "holdingTime">[]
  ): BotDetectionResult {
    if (transactions.length === 0) {
      return { isSuspectedBot: false, botType: null, botConfidence: 0 };
    }

    const checks = [
      this.checkHighFrequency(transactions),
      this.checkMicroProfitArb(trades),
      this.checkMevProgramInteraction(transactions),
      this.checkSniperBehavior(trades),
    ];

    let maxConfidence = 0;
    let suspectedType: BotDetectionResult["botType"] = null;

    for (const check of checks) {
      if (check.confidence > maxConfidence) {
        maxConfidence = check.confidence;
        suspectedType = check.type;
      }
    }

    return {
      isSuspectedBot: maxConfidence >= 0.8,
      botType: maxConfidence >= 0.8 ? suspectedType : null,
      botConfidence: maxConfidence,
    };
  }

  private checkHighFrequency(
    transactions: Pick<Transaction, "timestamp">[]
  ): { type: "HIGH_FREQUENCY" | null; confidence: number } {
    if (transactions.length < 50) {
      return { type: null, confidence: 0 };
    }

    const sorted = [...transactions].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const first = sorted[0].timestamp.getTime();
    const last = sorted[sorted.length - 1].timestamp.getTime();
    const spanDays = Math.max(1, (last - first) / (24 * 60 * 60 * 1000));
    
    const txPerDay = transactions.length / spanDays;

    if (txPerDay > 500) {
      return { type: "HIGH_FREQUENCY", confidence: 0.95 }; // Almost certainly a bot
    }
    if (txPerDay > 200) {
      return { type: "HIGH_FREQUENCY", confidence: 0.75 }; // Suspiciously active
    }

    return { type: null, confidence: 0 };
  }

  private checkMicroProfitArb(
    trades: Pick<Trade, "roi">[]
  ): { type: "ARBITRAGE" | null; confidence: number } {
    const closedTrades = trades.filter((t) => t.roi != null);
    if (closedTrades.length < 20) {
      return { type: null, confidence: 0 };
    }

    let microProfitCount = 0;
    for (const trade of closedTrades) {
      const roi = trade.roi ?? 0;
      // Arb bots usually make very small consistent profits, e.g. 0.05% to 2%
      if (roi > 0 && roi <= 2) {
        microProfitCount++;
      }
    }

    const microRatio = microProfitCount / closedTrades.length;
    
    if (microRatio > 0.8) {
      return { type: "ARBITRAGE", confidence: 0.9 };
    }

    return { type: null, confidence: 0 };
  }

  private checkMevProgramInteraction(
    transactions: Pick<Transaction, "description">[]
  ): { type: "MEV" | null; confidence: number } {
    let mevInteractions = 0;
    // VERY simple heuristic based on Helius descriptions mentioning MEV tips or Jito
    for (const tx of transactions) {
      const desc = tx.description?.toLowerCase() ?? "";
      if (desc.includes("jito tip") || desc.includes("mev")) {
        mevInteractions++;
      }
    }

    if (mevInteractions > 5) {
       return { type: "MEV", confidence: 0.99 }; // Paid a tip program directly multiple times
    }

    return { type: null, confidence: 0 };
  }

  private checkSniperBehavior(
    trades: Pick<Trade, "holdingTime">[]
  ): { type: "SNIPER" | null; confidence: number } {
    const closedTrades = trades.filter((t) => t.holdingTime != null);
    if (closedTrades.length < 15) {
       return { type: null, confidence: 0 };
    }

    let instantSells = 0;
    for (const trade of closedTrades) {
      // Bought and sold in under 15 seconds
      if ((trade.holdingTime ?? 999) < 15) {
        instantSells++;
      }
    }

    const sniperRatio = instantSells / closedTrades.length;
    if (sniperRatio > 0.6) {
       return { type: "SNIPER", confidence: 0.85 };
    }

    return { type: null, confidence: 0 };
  }
}

export const botDetectionService = new BotDetectionService();
