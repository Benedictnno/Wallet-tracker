import { prisma } from "../../lib/prisma";

export type RiskCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * GlobalRiskGuard
 *
 * Checks global risk limits stored in GlobalSettings before any trade is executed.
 * Both CopyTradeService (webhook-triggered) and PositionMonitorService (auto-exit)
 * call this before creating an ExecutionRecord.
 *
 * Limits enforced:
 *  1. globalMaxOpenPositions — halt BUY if open positions >= limit
 *  2. globalDailyLossSol    — halt all trading if today''s realized SOL loss >= limit
 */
export class GlobalRiskGuard {
  /**
   * Check whether a new BUY trade is permitted.
   */
  async checkBuyAllowed(): Promise<RiskCheckResult> {
    const settings = await this.getSettings();
    if (!settings) return { allowed: true };

    // --- 1. Open positions cap ---
    const openBuys = await this.countOpenPositions();
    if (openBuys >= settings.globalMaxOpenPositions) {
      return {
        allowed: false,
        reason: `Max open positions reached (${openBuys}/${settings.globalMaxOpenPositions}). BUY blocked.`,
      };
    }

    // --- 2. Daily loss cap ---
    const dailyLoss = await this.calcTodayRealizedLossSol();
    if (dailyLoss >= settings.globalDailyLossSol) {
      return {
        allowed: false,
        reason: `Daily SOL loss cap hit (${dailyLoss.toFixed(4)} SOL lost vs ${settings.globalDailyLossSol} SOL limit). All trading halted.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check whether any trade (SELL / auto-exit) is permitted.
   * Sells are only blocked by the daily loss cap (not position count).
   */
  async checkSellAllowed(): Promise<RiskCheckResult> {
    const settings = await this.getSettings();
    if (!settings) return { allowed: true };

    const dailyLoss = await this.calcTodayRealizedLossSol();
    if (dailyLoss >= settings.globalDailyLossSol) {
      return {
        allowed: false,
        reason: `Daily SOL loss cap hit (${dailyLoss.toFixed(4)} SOL lost vs ${settings.globalDailyLossSol} SOL limit). All trading halted.`,
      };
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getSettings() {
    return prisma.globalSettings.findUnique({ where: { id: "singleton" } });
  }

  /**
   * Count open BUY positions: BUY records with SIMULATED or EXECUTED status
   * that have no paired SELL yet.
   */
  private async countOpenPositions(): Promise<number> {
    return prisma.executionRecord.count({
      where: {
        type: "BUY",
        status: { in: ["SIMULATED", "EXECUTED"] },
        pairedSells: { none: {} },
      },
    });
  }

  /**
   * Realized daily SOL loss: sum of (buy amountSol - sell amountSol) for
   * all pairs where the SELL closed today and at a loss (sell < buy).
   *
   * We approximate by summing amountSol on losing SELL records today
   * (i.e. where the exit amount is less than the entry - derived from pairedBuy).
   */
  private async calcTodayRealizedLossSol(): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todaySells = await prisma.executionRecord.findMany({
      where: {
        type: "SELL",
        status: { in: ["SIMULATED", "EXECUTED"] },
        timestamp: { gte: todayStart },
        pairedBuyId: { not: null },
      },
      include: { pairedBuy: true },
    });

    let totalLoss = 0;
    for (const sell of todaySells) {
      const buyAmount = sell.pairedBuy?.amountSol ?? 0;
      const sellAmount = sell.amountSol;
      if (sellAmount < buyAmount) {
        totalLoss += buyAmount - sellAmount;
      }
    }

    return totalLoss;
  }
}

export const globalRiskGuard = new GlobalRiskGuard();
