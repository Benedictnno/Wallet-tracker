import type { Trade } from "@prisma/client";
import type { WalletAnalyticsSnapshot } from "@/services/WalletScoringEngine";

type TradeInput = Pick<
  Trade,
  "entryPrice" | "exitPrice" | "profitLoss" | "roi" | "holdingTime" | "entryTime" | "exitTime"
>;

export class WalletAnalyticsService {
  summarizeTrades(trades: TradeInput[]): WalletAnalyticsSnapshot | null {
    const closedTrades = trades.filter((trade) => trade.roi != null);

    if (closedTrades.length === 0) {
      return null;
    }

    const investedCapital = closedTrades.reduce(
      (sum, trade) => sum + Math.max(trade.entryPrice, 0),
      0
    );
    const realizedProfit = closedTrades.reduce(
      (sum, trade) => sum + (trade.profitLoss ?? 0),
      0
    );
    const totalROI = investedCapital > 0 ? (realizedProfit / investedCapital) * 100 : 0;
    const averageTradeROI =
      closedTrades.reduce((sum, trade) => sum + (trade.roi ?? 0), 0) / closedTrades.length;
    const winningTrades = closedTrades.filter((trade) => (trade.roi ?? 0) > 0);
    const losingTrades = closedTrades.filter((trade) => (trade.roi ?? 0) < 0);
    const totalWinningProfit = winningTrades.reduce(
      (sum, trade) => sum + Math.max(trade.profitLoss ?? 0, 0),
      0
    );
    const totalLosingProfit = losingTrades.reduce(
      (sum, trade) => sum + Math.abs(Math.min(trade.profitLoss ?? 0, 0)),
      0
    );
    const profitFactor = totalLosingProfit > 0 ? totalWinningProfit / totalLosingProfit : 4;
    const winRate = (winningTrades.length / closedTrades.length) * 100;
    const earlyEntryPercentage = this.estimateEntryTimingScore(closedTrades);
    const riskManagementScore = this.estimateRiskScore(closedTrades);
    const tradeQuality = this.estimateTradeQuality(closedTrades);
    const copyability = this.estimateCopyability(closedTrades);

    return {
      totalROI,
      averageTradeROI,
      profitFactor,
      winRate,
      tradeCount: closedTrades.length,
      earlyEntryPercentage,
      riskManagementScore,
      tradeQuality,
      copyability,
    };
  }

  private estimateEntryTimingScore(trades: TradeInput[]) {
    // Until launch-time metadata is added, use fast profitable rotations as a proxy.
    const qualifyingTrades = trades.filter((trade) => {
      const holdingTime = trade.holdingTime ?? this.estimateHoldingTimeSeconds(trade);
      return (trade.roi ?? 0) > 20 && holdingTime <= 24 * 60 * 60;
    });

    return (qualifyingTrades.length / trades.length) * 100;
  }

  private estimateRiskScore(trades: TradeInput[]) {
    const losses = trades.map((trade) => trade.roi ?? 0).filter((roi) => roi < 0);
    const averageLoss =
      losses.length > 0
        ? losses.reduce((sum, roi) => sum + Math.abs(roi), 0) / losses.length
        : 0;

    return Math.max(0, 100 - averageLoss);
  }

  private estimateTradeQuality(trades: TradeInput[]) {
    const positiveTrades = trades.filter((trade) => (trade.roi ?? 0) > 0);
    const qualityScore =
      positiveTrades.reduce((sum, trade) => {
        const roi = trade.roi ?? 0;
        const holdingTime = trade.holdingTime ?? this.estimateHoldingTimeSeconds(trade);
        const durationFactor = holdingTime > 0 ? Math.min(1, 3 * 24 * 60 * 60 / holdingTime) : 1;
        return sum + Math.min(roi, 200) * durationFactor;
      }, 0) / trades.length;

    return Math.min(Math.max(qualityScore, 0), 100);
  }

  private estimateCopyability(trades: TradeInput[]) {
    const averageHoldingTime =
      trades.reduce(
        (sum, trade) => sum + (trade.holdingTime ?? this.estimateHoldingTimeSeconds(trade)),
        0
      ) / trades.length;

    const copyability = Math.min(100, (averageHoldingTime / (60 * 60)) * 8);
    return Math.max(copyability, 15);
  }

  private estimateHoldingTimeSeconds(trade: TradeInput) {
    if (!trade.exitTime) {
      return 0;
    }

    return Math.max(
      0,
      Math.round((trade.exitTime.getTime() - trade.entryTime.getTime()) / 1000)
    );
  }
}
