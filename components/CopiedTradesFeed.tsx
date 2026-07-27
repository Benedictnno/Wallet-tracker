"use client";

import { useEffect, useState } from "react";
import { getExecutionModeAction } from "@/app/actions";

type ExecutionRecordItem = {
  id: string;
  targetTradeId: string | null;
  status: string;
  type: string;
  amountSol: number;
  amountToken: number | null;
  executionPrice: number | null;
  errorReason: string | null;
  timestamp: Date | string;
  token: {
    symbol: string;
    name: string;
    address: string;
  };
};

export default function CopiedTradesFeed({ records: initialRecords }: { records: ExecutionRecordItem[] }) {
  const [feed, setFeed] = useState<ExecutionRecordItem[]>(initialRecords || []);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<{ mode: "LIVE" | "PAPER"; message: string } | null>(null);

  useEffect(() => {
    // Check execution mode (Live vs Paper)
    getExecutionModeAction().then((mode) => setExecutionMode(mode));

    // Connect to Server-Sent Events stream for live execution updates
    const eventSource = new EventSource("/api/copy-trade/stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.records && Array.isArray(data.records)) {
          setFeed((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newItems = data.records.filter((r: ExecutionRecordItem) => !existingIds.has(r.id));
            if (newItems.length > 0) {
              return [...newItems, ...prev];
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleRunPositionMonitor = async () => {
    setIsMonitoring(true);
    setMonitorMessage(null);

    try {
      const res = await fetch("/api/copy-trade/monitor");
      const data = await res.json();

      if (data.success) {
        const count = data.actionsTaken?.length || 0;
        setMonitorMessage(
          count > 0
            ? `⚡ Auto-Exit Triggered: Closed ${count} position(s) matching TP/SL criteria.`
            : `✅ Position Check Complete: All open positions within TP/SL boundaries.`
        );
      } else {
        setMonitorMessage(`⚠️ Monitor check failed: ${data.error}`);
      }
    } catch (err: any) {
      setMonitorMessage(`⚠️ Error running monitor: ${err?.message || "Unknown error"}`);
    } finally {
      setIsMonitoring(false);
    }
  };

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">📡 Live Copied Trades Feed</h2>
          <p className="mt-1 text-sm text-slate-600">
            Real-time record of trades & Jupiter quotes triggered by webhooks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunPositionMonitor}
            disabled={isMonitoring}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {isMonitoring ? "Evaluating TP/SL..." : "🎯 Run TP/SL Check"}
          </button>
          
          {executionMode && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold animate-pulse ${
                executionMode.mode === "LIVE"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
              title={executionMode.message}
            >
              {executionMode.mode === "LIVE" ? "🔴 LIVE TRADING ACTIVE" : "🟢 PAPER TRADING MODE"}
            </span>
          )}
        </div>
      </div>

      {monitorMessage && (
        <div className="mt-4 rounded-xl bg-sky-50 p-3 text-xs font-medium text-sky-800 border border-sky-200">
          {monitorMessage}
        </div>
      )}

      {feed.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">
          No copy-trading executions recorded yet. Active webhooks will log executions here automatically.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3 font-medium">Timestamp</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Token</th>
                <th className="pb-3 font-medium">Size (SOL)</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Signature / Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feed.map((record) => {
                const isBuy = record.type === "BUY";
                const timeStr = new Date(record.timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                });

                return (
                  <tr key={record.id}>
                    <td className="py-3.5 text-xs text-slate-600 font-mono">{timeStr}</td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ${
                          isBuy
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20"
                            : "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20"
                        }`}
                      >
                        {record.type}
                      </span>
                    </td>
                    <td className="py-3.5 font-medium text-slate-900">
                      {record.token?.symbol || "UNKNOWN"}
                    </td>
                    <td className="py-3.5 text-slate-900 font-medium">
                      {record.amountSol} SOL
                    </td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          record.status === "EXECUTED"
                            ? "bg-emerald-100 text-emerald-800"
                            : record.status === "SIMULATED"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-xs font-mono text-slate-500 max-w-[140px] truncate">
                      {record.targetTradeId ? (
                        <a
                          href={`https://solscan.io/tx/${record.targetTradeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-600 hover:underline"
                        >
                          {record.targetTradeId.slice(0, 8)}...{record.targetTradeId.slice(-6)}
                        </a>
                      ) : (
                        "--"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
