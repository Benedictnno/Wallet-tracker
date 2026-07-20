"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PaperTradingChartPoint = {
  tradeLabel: string;
  tokenSymbol: string;
  exitLabel: string;
  allocatedCapital: number;
  profitLoss: number;
  endingCapital: number;
  roi: number;
};

interface PaperTradingChartProps {
  data: PaperTradingChartPoint[];
  startingCapital: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PaperTradingChart({
  data,
  startingCapital,
}: PaperTradingChartProps) {
  if (data.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-900">Capital Curve</h3>
          <p className="mt-1 text-xs text-slate-500">
            Simulated bankroll after each copied trade.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          Baseline {formatCurrency(startingCapital)}
        </div>
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="paperTradingCapital" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f766e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0f766e" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="tradeLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(value: number) => `$${Math.round(value)}`}
              width={64}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === "endingCapital") {
                  return [formatCurrency(value), "Ending capital"];
                }

                if (name === "profitLoss") {
                  return [formatCurrency(value), "Profit / loss"];
                }

                if (name === "allocatedCapital") {
                  return [formatCurrency(value), "Allocated"];
                }

                return [`${Math.round(value)}%`, "Trade ROI"];
              }}
              labelFormatter={(_label, payload) => {
                const point = payload?.[0]?.payload as PaperTradingChartPoint | undefined;

                if (!point) {
                  return "";
                }

                return `${point.tradeLabel} · ${point.tokenSymbol} · ${point.exitLabel}`;
              }}
              contentStyle={{
                borderRadius: 16,
                borderColor: "#cbd5e1",
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              }}
            />
            <ReferenceLine
              y={startingCapital}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
            <Area
              type="monotone"
              dataKey="endingCapital"
              stroke="#0f766e"
              strokeWidth={2}
              fill="url(#paperTradingCapital)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
