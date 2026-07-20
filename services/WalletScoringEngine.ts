export type WalletAnalyticsSnapshot = {
  totalROI: number;
  averageTradeROI: number;
  profitFactor: number;
  winRate: number;
  tradeCount: number;
  earlyEntryPercentage: number;
  riskManagementScore: number;
  tradeQuality: number;
  copyability: number;
};

export type WalletScoreBreakdown = {
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

    const totalScore =
      profitabilityScore * 0.3 +
      consistencyScore * 0.2 +
      entryTimingScore * 0.15 +
      riskScore * 0.15 +
      tradeQualityScore * 0.1 +
      copyabilityScore * 0.1;

    return {
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

    const averageRoiComponent = this.normalize(data.averageTradeROI, -100, 150);
    const profitFactorComponent = this.normalize(data.profitFactor, 0, 4);

    return this.roundScore(
      roiComponent * 0.5 + averageRoiComponent * 0.25 + profitFactorComponent * 0.25
    );
  }

  private calculateConsistencyScore(data: WalletAnalyticsSnapshot): number {
    const confidenceMultiplier =
      data.tradeCount < 10 ? 0.3 : data.tradeCount < 50 ? 0.7 : data.tradeCount >= 200 ? 1.2 : 1;

    return this.roundScore(
      Math.min(100, data.winRate * confidenceMultiplier)
    );
  }

  private calculateEntryTimingScore(data: WalletAnalyticsSnapshot): number {
    return this.roundScore(data.earlyEntryPercentage);
  }

  private calculateRiskScore(data: WalletAnalyticsSnapshot): number {
    return this.roundScore(data.riskManagementScore);
  }

  private calculateTradeQualityScore(data: WalletAnalyticsSnapshot): number {
    return this.roundScore(data.tradeQuality);
  }

  private calculateCopyabilityScore(data: WalletAnalyticsSnapshot): number {
    return this.roundScore(data.copyability);
  }

  private scoreBands(
    value: number,
    bands: Array<{ min: number; score: number }>
  ): number {
    return bands.find((band) => value >= band.min)?.score ?? 0;
  }

  private normalize(value: number, min: number, max: number): number {
    if (max <= min) {
      return 0;
    }

    const clamped = Math.min(Math.max(value, min), max);
    return ((clamped - min) / (max - min)) * 100;
  }

  private roundScore(score: number) {
    return Math.round(Math.min(Math.max(score, 0), 100) * 100) / 100;
  }

  private getClassification(score: number): string {
    if (score >= 85) return "Elite Smart Wallet";
    if (score >= 70) return "Skilled Degen";
    if (score >= 40) return "Gambler";
    return "Avoid";
  }
}
