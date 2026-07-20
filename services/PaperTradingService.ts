import type { Token, Trade } from "@prisma/client";

type TokenSnapshot = Pick<Token, "id" | "symbol" | "name" | "address" | "chain">;

type TradeWithToken = Pick<
  Trade,
  "id" | "entryPrice" | "exitPrice" | "profitLoss" | "roi" | "entryTime" | "exitTime"
> & {
  token: TokenSnapshot;
};

export type SimulationConfig = {
  startingCapital?: number;
  allocationPercent?: number;
  minPositionSize?: number;
  maxPositionSize?: number;
};

export type PaperTradeSnapshot = {
  tradeId: string;
  tokenSymbol: string;
  tokenAddress: string;
  entryTime: Date;
  exitTime: Date | null;
  allocatedCapital: number;
  profitLoss: number;
  roi: number;
  endingCapital: number;
};

export type PaperTradingSummary = {
  config: Required<SimulationConfig>;
  startingCapital: number;
  endingCapital: number;
  totalReturnPct: number;
  totalProfitLoss: number;
  maxDrawdownPct: number;
  simulatedTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageTradeReturnPct: number | null;
  totalAllocatedCapital: number;
  snapshots: PaperTradeSnapshot[];
};

export const DEFAULT_SIMULATION_CONFIG: Required<SimulationConfig> = {
  startingCapital: 1000,
  allocationPercent: 0.1,
  minPositionSize: 50,
  maxPositionSize: 200,
};

export class PaperTradingService {
  simulateCopyTrading(
    trades: TradeWithToken[],
    config: SimulationConfig = {}
  ): PaperTradingSummary | null {
    const resolvedConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    const closedTrades = trades
      .filter((trade) => trade.roi != null)
      .sort((left, right) => left.entryTime.getTime() - right.entryTime.getTime());

    if (closedTrades.length === 0) {
      return null;
    }

    let capital = resolvedConfig.startingCapital;
    let peakCapital = capital;
    let maxDrawdownPct = 0;

    const snapshots = closedTrades.map((trade) => {
      const suggestedAllocation = capital * resolvedConfig.allocationPercent;
      const allocatedCapital = Math.min(
        capital,
        Math.max(
          resolvedConfig.minPositionSize,
          Math.min(suggestedAllocation, resolvedConfig.maxPositionSize)
        )
      );

      const tradeReturnPct = trade.roi ?? 0;
      const profitLoss = allocatedCapital * (tradeReturnPct / 100);
      capital += profitLoss;
      peakCapital = Math.max(peakCapital, capital);

      const drawdownPct =
        peakCapital > 0 ? ((peakCapital - capital) / peakCapital) * 100 : 0;
      maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

      return {
        tradeId: trade.id,
        tokenSymbol: trade.token.symbol,
        tokenAddress: trade.token.address,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        allocatedCapital,
        profitLoss,
        roi: tradeReturnPct,
        endingCapital: capital,
      } satisfies PaperTradeSnapshot;
    });

    const totalProfitLoss = capital - resolvedConfig.startingCapital;
    const winningTrades = snapshots.filter((snapshot) => snapshot.profitLoss > 0).length;
    const losingTrades = snapshots.filter((snapshot) => snapshot.profitLoss < 0).length;
    const averageTradeReturnPct =
      snapshots.reduce((sum, snapshot) => sum + snapshot.roi, 0) / snapshots.length;
    const totalAllocatedCapital = snapshots.reduce(
      (sum, snapshot) => sum + snapshot.allocatedCapital,
      0
    );

    return {
      config: resolvedConfig,
      startingCapital: resolvedConfig.startingCapital,
      endingCapital: capital,
      totalReturnPct:
        resolvedConfig.startingCapital > 0
          ? (totalProfitLoss / resolvedConfig.startingCapital) * 100
          : 0,
      totalProfitLoss,
      maxDrawdownPct,
      simulatedTrades: snapshots.length,
      winningTrades,
      losingTrades,
      averageTradeReturnPct,
      totalAllocatedCapital,
      snapshots,
    };
  }
}
