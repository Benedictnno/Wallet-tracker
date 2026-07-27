import type { Trade } from "@prisma/client";
import type { WalletAnalyticsSnapshot } from "@/services/WalletScoringEngine";

type TradeInput = Pick<
  Trade,
  | "entryPrice"
  | "exitPrice"
  | "profitLoss"
  | "roi"
  | "holdingTime"
  | "entryTime"
  | "exitTime"
  | "tokenAgeSecondsAtEntry"
  | "entryLiquidityEstimate"
  | "entryMarketCapEstimate"
  | "delayPriceChangePct"
  | "delayWindowSeconds"
> & {
  token: { isSpam: boolean };
};

export class WalletAnalyticsService {
  summarizeTrades(trades: TradeInput[], integrityPenalty: number = 0): WalletAnalyticsSnapshot | null {
    const validTrades = trades.filter(t => !t.token.isSpam);

    const closedTrades = validTrades
      .filter((trade) => trade.roi != null)
      .sort(
        (left, right) => left.entryTime.getTime() - right.entryTime.getTime(),
      );

    if (closedTrades.length === 0) {
      return null;
    }

    const investedCapital = closedTrades.reduce(
      (sum, trade) => sum + Math.max(trade.entryPrice, 0),
      0,
    );
    const realizedProfit = closedTrades.reduce(
      (sum, trade) => sum + (trade.profitLoss ?? 0),
      0,
    );
    const totalROI =
      investedCapital > 0 ? (realizedProfit / investedCapital) * 100 : 0;
    const averageTradeROI =
      closedTrades.reduce((sum, trade) => sum + (trade.roi ?? 0), 0) /
      closedTrades.length;
    const winningTrades = closedTrades.filter((trade) => (trade.roi ?? 0) > 0);
    const losingTrades = closedTrades.filter((trade) => (trade.roi ?? 0) < 0);
    const totalWinningProfit = winningTrades.reduce(
      (sum, trade) => sum + Math.max(trade.profitLoss ?? 0, 0),
      0,
    );
    const totalLosingProfit = losingTrades.reduce(
      (sum, trade) => sum + Math.abs(Math.min(trade.profitLoss ?? 0, 0)),
      0,
    );
    const profitFactor =
      totalLosingProfit > 0 ? totalWinningProfit / totalLosingProfit : 4;
    const winRate = (winningTrades.length / closedTrades.length) * 100;
    const totalTrades = closedTrades.length;
    const tradeCountConfidence = this.getTradeCountConfidence(totalTrades);
    const monthlyConsistency = this.estimateMonthlyConsistency(closedTrades);
    const earlyEntryPercentage = this.estimateEntryTimingScore(closedTrades);
    const firstBuyerPercentage =
      this.estimateFirstBuyerPercentage(closedTrades);
    const averageHoldingTimeHours =
      this.estimateAverageHoldingTimeHours(closedTrades);
    const averageTradesPerDay = this.estimateTradeFrequency(closedTrades);
    const maxDrawdown = this.estimateMaxDrawdown(closedTrades);
    const largestPositionPercentage = this.estimateLargestPositionPercentage(
      closedTrades,
      investedCapital,
    );
    const averageLossPercentage =
      this.estimateAverageLossPercentage(losingTrades);
    const riskAdjustedReturn = this.estimateRiskAdjustedReturn(closedTrades);
    const exitQualityScore = this.estimateExitQuality(
      winRate,
      profitFactor,
      averageHoldingTimeHours,
    );
    const delaySensitivityScore = this.estimateDelaySensitivity(
      averageHoldingTimeHours,
      closedTrades,
    );
    const liquidityScore = this.estimateLiquidityScore(
      largestPositionPercentage,
      averageTradesPerDay,
      closedTrades,
    );

    return {
      totalROI,
      averageTradeROI,
      profitFactor,
      winRate,
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      tradeCountConfidence,
      monthlyConsistency,
      earlyEntryPercentage,
      firstBuyerPercentage,
      averageHoldingTimeHours,
      averageTradesPerDay,
      maxDrawdown,
      largestPositionPercentage,
      averageLossPercentage,
      riskAdjustedReturn,
      exitQualityScore,
      delaySensitivityScore,
      liquidityScore,
      integrityPenalty,
    };
  }

  private estimateEntryTimingScore(trades: TradeInput[]) {
    const tradesWithTokenAge = trades.filter(
      (trade) => trade.tokenAgeSecondsAtEntry != null,
    );

    if (tradesWithTokenAge.length > 0) {
      const qualifyingTrades = tradesWithTokenAge.filter((trade) => {
        const tokenAgeSeconds =
          trade.tokenAgeSecondsAtEntry ?? Number.MAX_SAFE_INTEGER;
        const marketCapEstimate =
          trade.entryMarketCapEstimate ?? Number.POSITIVE_INFINITY;
        return tokenAgeSeconds <= 30 * 60 || marketCapEstimate <= 500_000;
      });

      return (qualifyingTrades.length / tradesWithTokenAge.length) * 100;
    }

    const qualifyingTrades = trades.filter((trade) => {
      const holdingTime =
        trade.holdingTime ?? this.estimateHoldingTimeSeconds(trade);
      return (trade.roi ?? 0) > 20 && holdingTime <= 24 * 60 * 60;
    });

    return (qualifyingTrades.length / trades.length) * 100;
  }

  private estimateFirstBuyerPercentage(trades: TradeInput[]) {
    const tradesWithTokenAge = trades.filter(
      (trade) => trade.tokenAgeSecondsAtEntry != null,
    );

    if (tradesWithTokenAge.length > 0) {
      const firstWaveEntries = tradesWithTokenAge.filter(
        (trade) =>
          (trade.tokenAgeSecondsAtEntry ?? Number.MAX_SAFE_INTEGER) <= 5 * 60,
      );

      return (firstWaveEntries.length / tradesWithTokenAge.length) * 100;
    }

    const earlyImpulseEntries = trades.filter((trade) => {
      const holdingTime =
        trade.holdingTime ?? this.estimateHoldingTimeSeconds(trade);
      return (trade.roi ?? 0) > 10 && holdingTime <= 30 * 60;
    });

    return (earlyImpulseEntries.length / trades.length) * 100;
  }

  private estimateAverageHoldingTimeHours(trades: TradeInput[]) {
    const averageHoldingSeconds =
      trades.reduce(
        (sum, trade) =>
          sum + (trade.holdingTime ?? this.estimateHoldingTimeSeconds(trade)),
        0,
      ) / trades.length;

    return averageHoldingSeconds / (60 * 60);
  }

  private estimateTradeFrequency(trades: TradeInput[]) {
    if (trades.length <= 1) {
      return trades.length;
    }

    const firstTrade = trades[0];
    const lastTrade = trades[trades.length - 1];
    const spanInDays = Math.max(
      1,
      (lastTrade.entryTime.getTime() - firstTrade.entryTime.getTime()) /
        (24 * 60 * 60 * 1000),
    );

    return trades.length / spanInDays;
  }

  private estimateMaxDrawdown(trades: TradeInput[]) {
    let equity = 100;
    let peakEquity = equity;
    let maxDrawdown = 0;

    for (const trade of trades) {
      const roi = trade.roi ?? 0;
      const tradeImpact = 0.15 * (roi / 100);
      equity *= Math.max(0.1, 1 + tradeImpact);
      peakEquity = Math.max(peakEquity, equity);

      const drawdown =
        peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  private estimateLargestPositionPercentage(
    trades: TradeInput[],
    investedCapital: number,
  ) {
    if (investedCapital <= 0) {
      return 0;
    }

    return trades.reduce((largest, trade) => {
      const notional = Math.max(trade.entryPrice, 0);
      return Math.max(largest, (notional / investedCapital) * 100);
    }, 0);
  }

  private estimateAverageLossPercentage(trades: TradeInput[]) {
    if (trades.length === 0) {
      return 0;
    }

    return (
      trades.reduce((sum, trade) => sum + Math.abs(trade.roi ?? 0), 0) /
      trades.length
    );
  }

  private estimateRiskAdjustedReturn(trades: TradeInput[]) {
    const rois = trades.map((trade) => trade.roi ?? 0);
    const averageRoi = rois.reduce((sum, roi) => sum + roi, 0) / rois.length;
    const variance =
      rois.reduce((sum, roi) => sum + (roi - averageRoi) ** 2, 0) / rois.length;
    const stdDeviation = Math.sqrt(variance);

    if (stdDeviation === 0) {
      return averageRoi > 0 ? 2.5 : 0;
    }

    return averageRoi / stdDeviation;
  }

  private estimateExitQuality(
    winRate: number,
    profitFactor: number,
    averageHoldingTimeHours: number,
  ) {
    const timingScore =
      averageHoldingTimeHours <= 0.17
        ? 30
        : averageHoldingTimeHours <= 1
          ? 55
          : averageHoldingTimeHours <= 72
            ? 90
            : averageHoldingTimeHours <= 336
              ? 75
              : 60;
    const profitFactorScore = Math.min(100, (profitFactor / 4) * 100);

    return Math.min(
      100,
      winRate * 0.5 + profitFactorScore * 0.3 + timingScore * 0.2,
    );
  }

  private estimateDelaySensitivity(
    averageHoldingTimeHours: number,
    trades?: TradeInput[],
  ) {
    const tradesWithDelaySignal =
      trades?.filter((trade) => trade.delayPriceChangePct != null) ?? [];

    if (tradesWithDelaySignal.length > 0) {
      const averageDelayedMove =
        tradesWithDelaySignal.reduce(
          (sum, trade) => sum + Math.abs(trade.delayPriceChangePct ?? 0),
          0,
        ) / tradesWithDelaySignal.length;

      if (averageDelayedMove <= 2) return 95;
      if (averageDelayedMove <= 5) return 80;
      if (averageDelayedMove <= 10) return 60;
      if (averageDelayedMove <= 20) return 35;
      return 15;
    }

    if (averageHoldingTimeHours <= 0.08) return 10;
    if (averageHoldingTimeHours <= 0.5) return 35;
    if (averageHoldingTimeHours <= 4) return 65;
    if (averageHoldingTimeHours <= 48) return 90;
    return 100;
  }

  private estimateLiquidityScore(
    largestPositionPercentage: number,
    averageTradesPerDay: number,
    trades?: TradeInput[],
  ) {
    const tradesWithLiquidity =
      trades?.filter((trade) => trade.entryLiquidityEstimate != null) ?? [];

    if (tradesWithLiquidity.length > 0) {
      const averageLiquidity =
        tradesWithLiquidity.reduce(
          (sum, trade) => sum + (trade.entryLiquidityEstimate ?? 0),
          0,
        ) / tradesWithLiquidity.length;
      const liquidityComponent = this.normalizeLiquidity(averageLiquidity);
      const frequencyPenalty =
        averageTradesPerDay <= 4
          ? 0
          : averageTradesPerDay <= 10
            ? 10
            : averageTradesPerDay <= 20
              ? 25
              : 40;

      return Math.max(0, liquidityComponent - frequencyPenalty);
    }

    const positionComponent = Math.max(0, 100 - largestPositionPercentage);
    const frequencyPenalty =
      averageTradesPerDay <= 4
        ? 0
        : averageTradesPerDay <= 10
          ? 10
          : averageTradesPerDay <= 20
            ? 25
            : 40;

    return Math.max(0, positionComponent - frequencyPenalty);
  }

  private normalizeLiquidity(liquidity: number) {
    if (liquidity <= 25_000) return 20;
    if (liquidity <= 100_000) return 45;
    if (liquidity <= 500_000) return 70;
    if (liquidity <= 1_000_000) return 85;
    return 100;
  }

  private estimateMonthlyConsistency(trades: TradeInput[]) {
    const monthlyReturns = new Map<string, number>();

    for (const trade of trades) {
      const monthKey = `${trade.entryTime.getUTCFullYear()}-${trade.entryTime.getUTCMonth() + 1}`;
      monthlyReturns.set(
        monthKey,
        (monthlyReturns.get(monthKey) ?? 0) + (trade.roi ?? 0),
      );
    }

    const returns = [...monthlyReturns.values()];

    if (returns.length === 0) {
      return 0;
    }

    if (returns.length === 1) {
      return returns[0] > 0 ? 70 : 30;
    }

    const mean =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      returns.length;
    const stdDeviation = Math.sqrt(variance);
    const positiveMonthRatio =
      returns.filter((value) => value > 0).length / returns.length;
    const volatilityPenalty = Math.min(
      100,
      (stdDeviation / Math.max(Math.abs(mean), 25)) * 35,
    );

    return Math.max(
      0,
      Math.min(100, positiveMonthRatio * 100 - volatilityPenalty + 20),
    );
  }

  private getTradeCountConfidence(tradeCount: number) {
    if (tradeCount < 10) return 0.3;
    if (tradeCount < 50) return 0.7;
    if (tradeCount < 200) return 1;
    return 1.2;
  }

  private estimateHoldingTimeSeconds(trade: TradeInput) {
    if (!trade.exitTime) {
      return 0;
    }

    return Math.max(
      0,
      Math.round((trade.exitTime.getTime() - trade.entryTime.getTime()) / 1000),
    );
  }
}
