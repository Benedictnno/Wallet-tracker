export type WalletAnalyticsSnapshot = {
  totalROI: number;
  averageTradeROI: number;
  profitFactor: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  tradeCountConfidence: number;
  monthlyConsistency: number;
  earlyEntryPercentage: number;
  firstBuyerPercentage: number;
  averageHoldingTimeHours: number;
  averageTradesPerDay: number;
  maxDrawdown: number;
  largestPositionPercentage: number;
  averageLossPercentage: number;
  riskAdjustedReturn: number;
  exitQualityScore: number;
  delaySensitivityScore: number;
  liquidityScore: number;
  integrityPenalty: number;
};

export type WalletScoreBreakdown = WalletAnalyticsSnapshot & {
  profitabilityScore: number;
  consistencyScore: number;
  entryTimingScore: number;
  riskScore: number;
  tradeQualityScore: number;
  copyabilityScore: number;
  totalScore: number;
  classification: string;
};

export class WalletScoringEngine {
  calculateScore(walletData: WalletAnalyticsSnapshot): WalletScoreBreakdown {
    const profitabilityScore = this.calculateProfitabilityScore(walletData);
    const consistencyScore = this.calculateConsistencyScore(walletData);
    const entryTimingScore = this.calculateEntryTimingScore(walletData);
    const riskScore = this.calculateRiskScore(walletData);
    const tradeQualityScore = this.calculateTradeQualityScore(walletData);
    const copyabilityScore = this.calculateCopyabilityScore(walletData);

    const rawTotalScore =
      profitabilityScore * 0.3 +
      consistencyScore * 0.2 +
      entryTimingScore * 0.15 +
      riskScore * 0.15 +
      tradeQualityScore * 0.1 +
      copyabilityScore * 0.1;

    const totalScore = Math.max(0, rawTotalScore - walletData.integrityPenalty);

    return {
      ...walletData,
      profitabilityScore,
      consistencyScore,
      entryTimingScore,
      riskScore,
      tradeQualityScore,
      copyabilityScore,
      totalScore: Math.round(totalScore * 100) / 100,
      classification: this.getClassification(totalScore),
    };
  }

  private calculateProfitabilityScore(data: WalletAnalyticsSnapshot): number {
    const roiComponent = this.scoreBands(data.totalROI, [
      { min: 500, score: 100 },
      { min: 100, score: 80 },
      { min: 20, score: 50 },
      { min: Number.NEGATIVE_INFINITY, score: 20 },
    ]);

    const averageRoiComponent = this.normalize(data.averageTradeROI, -100, 200);
    const profitFactorComponent = this.normalize(data.profitFactor, 0, 4);
    const riskAdjustedReturnComponent = this.normalize(
      data.riskAdjustedReturn,
      -1,
      2.5,
    );

    return this.roundScore(
      roiComponent * 0.4 +
        averageRoiComponent * 0.25 +
        profitFactorComponent * 0.2 +
        riskAdjustedReturnComponent * 0.15,
    );
  }

  private calculateConsistencyScore(data: WalletAnalyticsSnapshot): number {
    const monthlyConsistencyComponent = data.monthlyConsistency;
    const baseScore = data.winRate * 0.55 + monthlyConsistencyComponent * 0.45;
    const confidenceMultiplier = this.clamp(
      data.tradeCountConfidence,
      0.3,
      1.2,
    );

    return this.roundScore(baseScore * confidenceMultiplier);
  }

  private calculateEntryTimingScore(data: WalletAnalyticsSnapshot): number {
    return this.roundScore(
      data.earlyEntryPercentage * 0.65 + data.firstBuyerPercentage * 0.35,
    );
  }

  private calculateRiskScore(data: WalletAnalyticsSnapshot): number {
    const drawdownComponent = this.invertNormalize(data.maxDrawdown, 5, 80);
    const positionSizingComponent = this.invertNormalize(
      data.largestPositionPercentage,
      10,
      80,
    );
    const lossControlComponent = this.invertNormalize(
      data.averageLossPercentage,
      5,
      80,
    );

    return this.roundScore(
      drawdownComponent * 0.45 +
        positionSizingComponent * 0.3 +
        lossControlComponent * 0.25,
    );
  }

  private calculateTradeQualityScore(data: WalletAnalyticsSnapshot): number {
    const riskAdjustedReturnComponent = this.normalize(
      data.riskAdjustedReturn,
      -1,
      2.5,
    );
    const holdingBehaviorComponent = this.getHoldingBehaviorScore(
      data.averageHoldingTimeHours,
    );

    return this.roundScore(
      data.exitQualityScore * 0.55 +
        riskAdjustedReturnComponent * 0.3 +
        holdingBehaviorComponent * 0.15,
    );
  }

  private calculateCopyabilityScore(data: WalletAnalyticsSnapshot): number {
    const tradeFrequencyComponent = this.getTradeFrequencyScore(
      data.averageTradesPerDay,
    );

    return this.roundScore(
      data.delaySensitivityScore * 0.45 +
        data.liquidityScore * 0.35 +
        tradeFrequencyComponent * 0.2,
    );
  }

  private scoreBands(
    value: number,
    bands: Array<{ min: number; score: number }>,
  ): number {
    return bands.find((band) => value >= band.min)?.score ?? 0;
  }

  private normalize(value: number, min: number, max: number): number {
    if (max <= min) {
      return 0;
    }

    const clamped = this.clamp(value, min, max);
    return ((clamped - min) / (max - min)) * 100;
  }

  private invertNormalize(value: number, min: number, max: number): number {
    return 100 - this.normalize(value, min, max);
  }

  private roundScore(score: number) {
    return Math.round(this.clamp(score, 0, 100) * 100) / 100;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  private getHoldingBehaviorScore(hours: number) {
    if (hours <= 0.17) return 25;
    if (hours <= 1) return 55;
    if (hours <= 72) return 100;
    if (hours <= 336) return 80;
    return 60;
  }

  private getTradeFrequencyScore(tradesPerDay: number) {
    if (tradesPerDay <= 1) return 100;
    if (tradesPerDay <= 4) return 90;
    if (tradesPerDay <= 10) return 70;
    if (tradesPerDay <= 20) return 50;
    return 30;
  }

  private getClassification(score: number): string {
    if (score >= 85) return "Elite Smart Wallet";
    if (score >= 70) return "Skilled Degen";
    if (score >= 40) return "Gambler";
    return "Avoid";
  }
}
