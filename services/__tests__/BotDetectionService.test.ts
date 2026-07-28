import { BotDetectionService } from "../BotDetectionService";
import type { Trade, Transaction } from "@prisma/client";

type PartialTransaction = Pick<Transaction, "timestamp" | "source" | "type" | "description">;
type PartialTrade = Pick<Trade, "roi" | "holdingTime">;

const SERVICE = new BotDetectionService();

/** Create N transactions over a given span of hours */
function makeTransactions(count: number, spanHours: number): PartialTransaction[] {
  const txs: PartialTransaction[] = [];
  const now = Date.now();
  const spanMs = spanHours * 60 * 60 * 1000;
  for (let i = 0; i < count; i++) {
    txs.push({
      timestamp: new Date(now - spanMs + (i * spanMs) / count),
      source: "JUPITER",
      type: "BUY",
      description: null,
    });
  }
  return txs;
}

describe("BotDetectionService", () => {
  describe("analyze - human wallet", () => {
    it("returns not-a-bot for an empty transaction list", () => {
      const result = SERVICE.analyze([], []);
      expect(result.isSuspectedBot).toBe(false);
      expect(result.botType).toBeNull();
      expect(result.botConfidence).toBe(0);
    });

    it("returns not-a-bot for a normal trading pace (~2 trades/day)", () => {
      const txs = makeTransactions(30, 24 * 15); // 30 txs over 15 days = 2/day
      const result = SERVICE.analyze(txs, []);
      expect(result.isSuspectedBot).toBe(false);
    });
  });

  describe("analyze - high frequency bot", () => {
    it("detects a HIGH_FREQUENCY bot with >500 txs/day", () => {
      // 600 txs in 1 day
      const txs = makeTransactions(600, 24);
      const result = SERVICE.analyze(txs, []);
      expect(result.isSuspectedBot).toBe(true);
      expect(result.botType).toBe("HIGH_FREQUENCY");
      expect(result.botConfidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe("analyze - arbitrage bot", () => {
    it("detects an ARBITRAGE bot with >80% micro-profit trades", () => {
      // 25 trades, all with ROI between 0.1 and 1.5 (micro-profit arb pattern)
      const trades: PartialTrade[] = Array.from({ length: 25 }, (_, i) => ({
        roi: 0.1 + (i % 5) * 0.3,
        holdingTime: 60,
      }));
      const result = SERVICE.analyze(makeTransactions(30, 24 * 30), trades);
      expect(result.isSuspectedBot).toBe(true);
      expect(result.botType).toBe("ARBITRAGE");
    });
  });

  describe("analyze - MEV bot", () => {
    it("detects a MEV bot based on jito tip descriptions", () => {
      const txs: PartialTransaction[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60_000),
        source: "JITO",
        type: "TRANSFER",
        description: i < 10 ? "jito tip bundle" : "swap",
      }));
      const result = SERVICE.analyze(txs, []);
      expect(result.isSuspectedBot).toBe(true);
      expect(result.botType).toBe("MEV");
    });
  });

  describe("analyze - sniper bot", () => {
    it("detects a SNIPER bot with >60% sub-15s holding times", () => {
      const trades: PartialTrade[] = Array.from({ length: 20 }, (_, i) => ({
        roi: 50,
        holdingTime: i < 14 ? 8 : 3600, // 70% are sub-15s
      }));
      const result = SERVICE.analyze(makeTransactions(50, 24 * 10), trades);
      expect(result.isSuspectedBot).toBe(true);
      expect(result.botType).toBe("SNIPER");
    });

    it("does not flag a wallet with few trades as a sniper", () => {
      // Only 5 trades — not enough to be confident
      const trades: PartialTrade[] = Array.from({ length: 5 }, () => ({
        roi: 200,
        holdingTime: 5,
      }));
      const result = SERVICE.analyze(makeTransactions(10, 24), trades);
      // Can't classify with only 5 trades
      expect(result.botType).not.toBe("SNIPER");
    });
  });
});
