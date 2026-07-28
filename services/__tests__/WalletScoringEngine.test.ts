import { WalletScoringEngine, WalletAnalyticsSnapshot } from "../WalletScoringEngine";

const ENGINE = new WalletScoringEngine();

/** A baseline snapshot representing a decent wallet */
const BASE_SNAPSHOT: WalletAnalyticsSnapshot = {
  totalROI: 150,
  averageTradeROI: 45,
  profitFactor: 2.5,
  winRate: 68,
  totalTrades: 30,
  winningTrades: 20,
  losingTrades: 10,
  tradeCountConfidence: 1.0,
  monthlyConsistency: 70,
  earlyEntryPercentage: 55,
  firstBuyerPercentage: 20,
  averageHoldingTimeHours: 6,
  averageTradesPerDay: 2,
  maxDrawdown: 20,
  largestPositionPercentage: 25,
  averageLossPercentage: 15,
  riskAdjustedReturn: 1.5,
  exitQualityScore: 70,
  delaySensitivityScore: 75,
  liquidityScore: 80,
  integrityPenalty: 0,
};

describe("WalletScoringEngine", () => {
  describe("calculateScore", () => {
    it("returns a score between 0 and 100", () => {
      const result = ENGINE.calculateScore(BASE_SNAPSHOT);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it("classifies an elite wallet correctly", () => {
      const snapshot: WalletAnalyticsSnapshot = {
        ...BASE_SNAPSHOT,
        totalROI: 600,
        averageTradeROI: 120,
        profitFactor: 4,
        winRate: 85,
        earlyEntryPercentage: 90,
        firstBuyerPercentage: 60,
        maxDrawdown: 5,
        exitQualityScore: 95,
        delaySensitivityScore: 95,
        liquidityScore: 95,
      };
      const result = ENGINE.calculateScore(snapshot);
      expect(result.totalScore).toBeGreaterThanOrEqual(85);
      expect(result.classification).toBe("Elite Smart Wallet");
    });

    it("classifies an avoid wallet correctly", () => {
      const snapshot: WalletAnalyticsSnapshot = {
        ...BASE_SNAPSHOT,
        totalROI: -50,
        averageTradeROI: -30,
        profitFactor: 0.3,
        winRate: 25,
        earlyEntryPercentage: 5,
        maxDrawdown: 80,
        exitQualityScore: 10,
        delaySensitivityScore: 10,
        liquidityScore: 10,
      };
      const result = ENGINE.calculateScore(snapshot);
      expect(result.totalScore).toBeLessThan(40);
      expect(result.classification).toBe("Avoid");
    });

    it("applies integrity penalty correctly", () => {
      const withoutPenalty = ENGINE.calculateScore(BASE_SNAPSHOT);
      const withPenalty = ENGINE.calculateScore({ ...BASE_SNAPSHOT, integrityPenalty: 20 });
      expect(withoutPenalty.totalScore - withPenalty.totalScore).toBeCloseTo(20, 0);
    });

    it("never returns a score below 0 even with large penalty", () => {
      const result = ENGINE.calculateScore({ ...BASE_SNAPSHOT, integrityPenalty: 200 });
      expect(result.totalScore).toBe(0);
    });

    it("all sub-scores are between 0 and 100", () => {
      const result = ENGINE.calculateScore(BASE_SNAPSHOT);
      expect(result.profitabilityScore).toBeGreaterThanOrEqual(0);
      expect(result.profitabilityScore).toBeLessThanOrEqual(100);
      expect(result.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(result.consistencyScore).toBeLessThanOrEqual(100);
      expect(result.entryTimingScore).toBeGreaterThanOrEqual(0);
      expect(result.entryTimingScore).toBeLessThanOrEqual(100);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(result.tradeQualityScore).toBeGreaterThanOrEqual(0);
      expect(result.tradeQualityScore).toBeLessThanOrEqual(100);
      expect(result.copyabilityScore).toBeGreaterThanOrEqual(0);
      expect(result.copyabilityScore).toBeLessThanOrEqual(100);
    });

    it("higher win rate leads to higher consistency score", () => {
      const low = ENGINE.calculateScore({ ...BASE_SNAPSHOT, winRate: 30 });
      const high = ENGINE.calculateScore({ ...BASE_SNAPSHOT, winRate: 85 });
      expect(high.consistencyScore).toBeGreaterThan(low.consistencyScore);
    });

    it("higher ROI leads to higher profitability score", () => {
      const low = ENGINE.calculateScore({ ...BASE_SNAPSHOT, totalROI: 10 });
      const high = ENGINE.calculateScore({ ...BASE_SNAPSHOT, totalROI: 600 });
      expect(high.profitabilityScore).toBeGreaterThan(low.profitabilityScore);
    });
  });
});
