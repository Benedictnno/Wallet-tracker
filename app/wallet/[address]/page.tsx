import Link from "next/link";
import { notFound } from "next/navigation";
import PaperTradingChart from "@/components/PaperTradingChart";
import RefreshWalletButton from "@/components/RefreshWalletButton";
import SyncWalletButton from "@/components/SyncWalletButton";
import { prisma } from "@/lib/prisma";
import { formatWalletAddress, getScoreTone } from "@/lib/wallets";
import {
  DEFAULT_SIMULATION_CONFIG,
  PaperTradingService,
} from "@/services/PaperTradingService";
import { WalletPortfolioService } from "@/services/WalletPortfolioService";

type WalletPageProps = {
  params: Promise<{ address: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatMetric(value?: number | null, suffix = "") {
  if (value == null) {
    return "--";
  }

  return `${Math.round(value)}${suffix}`;
}

function formatCurrency(value?: number | null) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value?: Date | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function parseNumberParam(
  value: string | string[] | undefined,
  fallback: number,
  {
    min,
    max,
  }: {
    min: number;
    max: number;
  }
) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

type ResolvedSimulationConfig = {
  startingCapital: number;
  allocationPercent: number;
  minPositionSize: number;
  maxPositionSize: number;
};

function createSimulationQuery(config: ResolvedSimulationConfig) {
  const params = new URLSearchParams({
    capital: `${Math.round(config.startingCapital)}`,
    allocation: `${Math.round(config.allocationPercent * 100)}`,
    minPosition: `${Math.round(config.minPositionSize)}`,
    maxPosition: `${Math.round(config.maxPositionSize)}`,
  });

  return `?${params.toString()}`;
}

export default async function WalletDetailPage({
  params,
  searchParams,
}: WalletPageProps) {
  const { address: walletId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const paperTradingService = new PaperTradingService();
  const portfolioService = new WalletPortfolioService();
  const wallet = await prisma.wallet.findUnique({
    where: {
      id: walletId,
    },
    include: {
      score: true,
      transactions: {
        include: {
          token: true,
        },
        orderBy: {
          timestamp: "desc",
        },
        take: 20,
      },
      trades: {
        include: {
          token: true,
        },
        orderBy: {
          entryTime: "desc",
        },
        take: 25,
      },
      _count: {
        select: {
          transactions: true,
          trades: true,
        },
      },
    },
  });

  if (!wallet) {
    notFound();
  }

  const closedTrades = wallet.trades.filter((trade) => trade.roi != null);
  const totalClosedTradeCapital = closedTrades.reduce(
    (sum, trade) => sum + Math.max(trade.entryPrice, 0),
    0
  );
  const averageTradeRoi = closedTrades.length
    ? closedTrades.reduce((sum, trade) => sum + (trade.roi ?? 0), 0) /
      closedTrades.length
    : null;
  const portfolio = portfolioService.summarize(wallet.transactions, wallet.trades);
  const simulationConfig = {
    startingCapital: parseNumberParam(
      resolvedSearchParams.capital,
      DEFAULT_SIMULATION_CONFIG.startingCapital,
      { min: 100, max: 100000 }
    ),
    allocationPercent:
      parseNumberParam(
        resolvedSearchParams.allocation,
        DEFAULT_SIMULATION_CONFIG.allocationPercent * 100,
        { min: 1, max: 100 }
      ) / 100,
    minPositionSize: parseNumberParam(
      resolvedSearchParams.minPosition,
      DEFAULT_SIMULATION_CONFIG.minPositionSize,
      { min: 10, max: 10000 }
    ),
    maxPositionSize: parseNumberParam(
      resolvedSearchParams.maxPosition,
      DEFAULT_SIMULATION_CONFIG.maxPositionSize,
      { min: 10, max: 25000 }
    ),
  };
  const paperTrading = paperTradingService.simulateCopyTrading(
    wallet.trades,
    simulationConfig
  );
  const actualRealizedReturnPct =
    totalClosedTradeCapital > 0
      ? (portfolio.realizedProfitLoss / totalClosedTradeCapital) * 100
      : null;
  const paperTradingChartData =
    paperTrading?.snapshots.map((snapshot, index) => ({
      tradeLabel: `T${index + 1}`,
      tokenSymbol: snapshot.tokenSymbol,
      exitLabel: formatDateTime(snapshot.exitTime ?? snapshot.entryTime),
      allocatedCapital: Number(snapshot.allocatedCapital.toFixed(2)),
      profitLoss: Number(snapshot.profitLoss.toFixed(2)),
      endingCapital: Number(snapshot.endingCapital.toFixed(2)),
      roi: Number(snapshot.roi.toFixed(2)),
    })) ?? [];
  const performanceGapPct =
    paperTrading && actualRealizedReturnPct != null
      ? paperTrading.totalReturnPct - actualRealizedReturnPct
      : null;
  const strategyPresets = [
    {
      label: "Conservative",
      description: "5% sizing with tighter caps",
      href: createSimulationQuery({
        ...simulationConfig,
        allocationPercent: 0.05,
        minPositionSize: 25,
        maxPositionSize: 100,
      }),
    },
    {
      label: "Balanced",
      description: "Default bankroll sizing",
      href: createSimulationQuery({
        ...simulationConfig,
        allocationPercent: DEFAULT_SIMULATION_CONFIG.allocationPercent,
        minPositionSize: DEFAULT_SIMULATION_CONFIG.minPositionSize,
        maxPositionSize: DEFAULT_SIMULATION_CONFIG.maxPositionSize,
      }),
    },
    {
      label: "Aggressive",
      description: "20% sizing with wider caps",
      href: createSimulationQuery({
        ...simulationConfig,
        allocationPercent: 0.2,
        minPositionSize: 100,
        maxPositionSize: 500,
      }),
    },
  ];
  const bestTrade = closedTrades.reduce<typeof closedTrades[number] | null>(
    (best, trade) => {
      if (!best || (trade.roi ?? 0) > (best.roi ?? 0)) {
        return trade;
      }

      return best;
    },
    null
  );
  const worstTrade = closedTrades.reduce<typeof closedTrades[number] | null>(
    (worst, trade) => {
      if (!worst || (trade.roi ?? 0) < (worst.roi ?? 0)) {
        return trade;
      }

      return worst;
    },
    null
  );

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-sky-700 hover:text-sky-800">
              Back to dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              {wallet.label || "Wallet Profile"}
            </h1>
            <p className="mt-2 break-all text-sm text-slate-600">
              {wallet.address}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <SyncWalletButton walletId={wallet.id} />
            <RefreshWalletButton walletId={wallet.id} />
            <div className="rounded-2xl bg-white px-5 py-4 text-right shadow-sm ring-1 ring-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Smart Score
              </p>
              <p className={`mt-2 text-3xl font-semibold ${getScoreTone(wallet.score?.totalScore)}`}>
                {wallet.score ? Math.round(wallet.score.totalScore) : "--"}
              </p>
              <p className="text-sm text-slate-500">
                {wallet.score?.classification || "Pending classification"}
              </p>
            </div>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Chain</p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {wallet.chain}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Transactions</p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {wallet._count.transactions}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Trades</p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {wallet._count.trades}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">Avg Trade ROI</p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {formatMetric(averageTradeRoi, "%")}
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Open Positions
            </p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {portfolio.openPositionCount}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Realized PnL
            </p>
            <p
              className={`mt-3 text-xl font-semibold ${
                portfolio.realizedProfitLoss >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatCurrency(portfolio.realizedProfitLoss)}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Buy / Sell
            </p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {portfolio.buyCount} / {portfolio.sellCount}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Last Activity
            </p>
            <p className="mt-3 text-xl font-semibold text-slate-900">
              {formatDateTime(portfolio.lastActiveAt)}
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Recent Trades
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  This is the first profile foundation for future transaction
                  parsing and copy-trading simulation.
                </p>
              </div>
            </div>

            {wallet.trades.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                No parsed trades yet. The next ingestion phase will populate
                this table from on-chain activity.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="pb-3 font-medium">Token</th>
                      <th className="pb-3 font-medium">Entry</th>
                      <th className="pb-3 font-medium">Exit</th>
                      <th className="pb-3 font-medium">ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wallet.trades.map((trade) => (
                      <tr key={trade.id}>
                        <td className="py-3 text-slate-900">
                          {trade.token.symbol}
                        </td>
                        <td className="py-3 text-slate-600">
                          {formatCurrency(trade.entryPrice)}
                        </td>
                        <td className="py-3 text-slate-600">
                          {trade.exitPrice == null
                            ? "--"
                            : formatCurrency(trade.exitPrice)}
                        </td>
                        <td
                          className={`py-3 font-medium ${
                            (trade.roi ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {trade.roi == null ? "--" : `${Math.round(trade.roi)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">
                Score Breakdown
              </h2>
              {wallet.score ? (
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Profitability</span>
                    <span className="font-medium text-slate-900">
                      {formatMetric(wallet.score.profitabilityScore)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Consistency</span>
                    <span className="font-medium text-slate-900">
                      {formatMetric(wallet.score.consistencyScore)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Entry Timing</span>
                    <span className="font-medium text-slate-900">
                      {formatMetric(wallet.score.entryTimingScore)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Risk</span>
                    <span className="font-medium text-slate-900">
                      {formatMetric(wallet.score.riskScore)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Trade Quality</span>
                    <span className="font-medium text-slate-900">
                      {formatMetric(wallet.score.tradeQualityScore)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Copyability</span>
                    <span className="font-medium text-slate-900">
                      {formatMetric(wallet.score.copyabilityScore)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  No score has been computed yet for this wallet.
                </p>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">
                Current Holdings
              </h2>
              {portfolio.holdings.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No open token positions are tracked yet.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {portfolio.holdings.slice(0, 6).map((holding) => (
                    <div
                      key={holding.tokenId}
                      className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {holding.tokenSymbol}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatWalletAddress(holding.tokenAddress)}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium text-slate-900">
                          {holding.amount.toFixed(4)}
                        </p>
                        <p className="text-slate-500">
                          Avg {formatCurrency(holding.averageEntryPrice)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">
                Paper Copy Trading
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Configure a virtual bankroll and sizing rules to test how
                copy-trading this wallet would have behaved.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {strategyPresets.map((preset) => (
                  <Link
                    key={preset.label}
                    href={preset.href}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {preset.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {preset.description}
                    </p>
                  </Link>
                ))}
              </div>

              <form className="mt-5 grid grid-cols-2 gap-3">
                <label className="text-sm text-slate-600">
                  Starting capital
                  <input
                    name="capital"
                    type="number"
                    min={100}
                    step={100}
                    defaultValue={simulationConfig.startingCapital}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Allocation %
                  <input
                    name="allocation"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    defaultValue={simulationConfig.allocationPercent * 100}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Min position
                  <input
                    name="minPosition"
                    type="number"
                    min={10}
                    step={10}
                    defaultValue={simulationConfig.minPositionSize}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Max position
                  <input
                    name="maxPosition"
                    type="number"
                    min={10}
                    step={10}
                    defaultValue={simulationConfig.maxPositionSize}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                  />
                </label>
                <div className="col-span-2 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Recalculate Simulation
                  </button>
                </div>
              </form>

              {paperTrading ? (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
                      <p className="text-xs uppercase tracking-wide text-sky-700">
                        Actual Wallet Return
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatMetric(actualRealizedReturnPct, "%")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Based on realized PnL across closed trades.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                      <p className="text-xs uppercase tracking-wide text-emerald-700">
                        Simulated Copy Return
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatMetric(paperTrading.totalReturnPct, "%")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Uses your bankroll and position-size rules.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Copy Gap
                      </p>
                      <p
                        className={`mt-2 text-lg font-semibold ${
                          (performanceGapPct ?? 0) >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatMetric(performanceGapPct, "%")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Difference between simulated and realized returns.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Starting Capital
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatCurrency(paperTrading.startingCapital)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Ending Capital
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatCurrency(paperTrading.endingCapital)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Total Return
                      </p>
                      <p
                        className={`mt-2 text-lg font-semibold ${
                          paperTrading.totalReturnPct >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatMetric(paperTrading.totalReturnPct, "%")}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Simulated PnL
                      </p>
                      <p
                        className={`mt-2 text-lg font-semibold ${
                          paperTrading.totalProfitLoss >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatCurrency(paperTrading.totalProfitLoss)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Max Drawdown
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatMetric(paperTrading.maxDrawdownPct, "%")}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Avg Simulated Trade
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatMetric(paperTrading.averageTradeReturnPct, "%")}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Capital Deployed
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {formatCurrency(paperTrading.totalAllocatedCapital)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Win / Loss
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {paperTrading.winningTrades} / {paperTrading.losingTrades}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    Strategy: {Math.round(paperTrading.config.allocationPercent * 100)}%
                    allocation per trade, min{" "}
                    {formatCurrency(paperTrading.config.minPositionSize)}, max{" "}
                    {formatCurrency(paperTrading.config.maxPositionSize)}.
                  </div>

                  <PaperTradingChart
                    data={paperTradingChartData}
                    startingCapital={paperTrading.startingCapital}
                  />

                  <div>
                    <h3 className="text-sm font-medium text-slate-900">
                      Recent Simulated Timeline
                    </h3>
                    <div className="mt-3 space-y-3">
                      {paperTrading.snapshots.slice(-5).reverse().map((snapshot) => (
                        <div
                          key={snapshot.tradeId}
                          className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                        >
                          <div>
                            <p className="font-medium text-slate-900">
                              {snapshot.tokenSymbol}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDateTime(snapshot.exitTime ?? snapshot.entryTime)}
                            </p>
                          </div>
                          <div className="text-right text-sm">
                            <p className="text-slate-500">
                              Allocated {formatCurrency(snapshot.allocatedCapital)}
                            </p>
                            <p
                              className={`font-medium ${
                                snapshot.profitLoss >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                              }`}
                            >
                              {formatCurrency(snapshot.profitLoss)}
                            </p>
                            <p className="text-slate-500">
                              Capital {formatCurrency(snapshot.endingCapital)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Closed trades are required before paper copy-trading can be
                  simulated.
                </p>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">
                Trade Highlights
              </h2>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Best trade</span>
                  <span className="font-medium text-emerald-600">
                    {bestTrade?.roi == null ? "--" : `${Math.round(bestTrade.roi)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Worst trade</span>
                  <span className="font-medium text-rose-600">
                    {worstTrade?.roi == null ? "--" : `${Math.round(worstTrade.roi)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Wallet Id</span>
                  <span className="font-medium text-slate-900">
                    {formatWalletAddress(wallet.id)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Recent Activity
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Latest parsed wallet activity imported from the sync pipeline.
            </p>
          </div>

          {wallet.transactions.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              No parsed transactions yet. Sync the wallet to pull Solana activity.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Token</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wallet.transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="py-3 text-slate-600">
                        {formatDateTime(transaction.timestamp)}
                      </td>
                      <td className="py-3 text-slate-900">
                        {transaction.token.symbol}
                      </td>
                      <td
                        className={`py-3 font-medium ${
                          transaction.type === "BUY"
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {transaction.type}
                      </td>
                      <td className="py-3 text-slate-600">
                        {transaction.amount.toFixed(4)}
                      </td>
                      <td className="py-3 text-slate-600">
                        {formatCurrency(transaction.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
