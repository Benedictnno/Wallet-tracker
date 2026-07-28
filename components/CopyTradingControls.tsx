"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CopyTradingControls({ walletId, initialSettings }: { walletId: string, initialSettings: any }) {
  const [enabled, setEnabled] = useState<boolean>(initialSettings?.enabled || false);
  const [tradeSize, setTradeSize] = useState<number>(initialSettings?.defaultTradeSize || 0.1);
  const [slippageBps, setSlippageBps] = useState<number>(initialSettings?.slippageBps || 300);
  const [takeProfitPct, setTakeProfitPct] = useState<number>(initialSettings?.takeProfitPct || 2.0);
  const [stopLossPct, setStopLossPct] = useState<number>(initialSettings?.stopLossPct || 0.5);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(initialSettings?.maxDailyLoss || 0.5);

  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(
    initialSettings?.enabled ? "🟢 Helius Webhook Active" : "⚪ Copy Trading Disabled"
  );

  const router = useRouter();

  async function saveSettings() {
    setLoading(true);
    setSyncStatus("⏳ Syncing with Helius...");
    try {
      const res = await fetch('/api/copy-trade/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          walletId, 
          enabled, 
          defaultTradeSize: Number(tradeSize),
          slippageBps: Number(slippageBps),
          takeProfitPct: Number(takeProfitPct),
          stopLossPct: Number(stopLossPct),
          maxDailyLoss: Number(maxDailyLoss)
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        if (data.heliusSync?.success) {
          setSyncStatus(`🟢 Synced with Helius (${data.heliusSync.action === 'created' ? 'Webhook Registered' : 'Address Synced'})`);
          if (enabled && !initialSettings?.enabled) {
            window.alert("✅ Copy trading is now ACTIVE for this wallet!\n\nThe bot is listening to Helius webhooks and will automatically mirror its trades based on your strategy settings.");
          }
        } else if (data.heliusSync?.reason) {
          setSyncStatus(`⚠️ Saved, but Helius: ${data.heliusSync.reason}`);
        } else {
          setSyncStatus("🟢 Strategy settings saved!");
          if (enabled && !initialSettings?.enabled) {
            window.alert("✅ Copy trading is now ACTIVE for this wallet!\n\nThe bot will automatically mirror its trades based on your strategy settings.");
          }
        }
      } else {
        setSyncStatus(`❌ Error: ${data.error || 'Failed to save'}`);
      }

      router.refresh();
    } catch (e: any) {
      console.error(e);
      setSyncStatus(`❌ Error saving settings`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            ⚡ Auto-Copy Strategy Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            When enabled, Helius webhooks trigger our execution engine to mirror this wallet's trades.
          </p>
        </div>
        {syncStatus && (
          <div className="inline-flex items-center rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-sky-300 ring-1 ring-white/10">
            {syncStatus}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 border-t border-slate-800/80 pt-5">
        <div className="flex items-center justify-between rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
          <div>
            <p className="font-semibold text-sm text-slate-200">Copy Trading Status</p>
            <p className="text-xs text-slate-400">Toggle live/paper auto-copy</p>
          </div>
          <input 
            type="checkbox" 
            checked={enabled} 
            onChange={e => setEnabled(e.target.checked)}
            className="w-6 h-6 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500 cursor-pointer"
          />
        </div>

        <div className="rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Trade Size (SOL)
          </label>
          <input 
            type="number" 
            step="0.05"
            min="0.01"
            value={tradeSize}
            onChange={e => setTradeSize(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">Fixed SOL amount per entry</p>
        </div>

        <div className="rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Slippage Tolerance (BPS)
          </label>
          <input 
            type="number" 
            step="50"
            min="50"
            max="2000"
            value={slippageBps}
            onChange={e => setSlippageBps(parseInt(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">300 BPS = 3.0% Max Slippage</p>
        </div>

        <div className="rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Take Profit Target (Multiple)
          </label>
          <input 
            type="number" 
            step="0.1"
            min="1.1"
            value={takeProfitPct}
            onChange={e => setTakeProfitPct(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">2.0 = Auto-sell at 2x profit</p>
        </div>

        <div className="rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Stop Loss Limit (%)
          </label>
          <input 
            type="number" 
            step="0.05"
            min="0.1"
            max="0.9"
            value={stopLossPct}
            onChange={e => setStopLossPct(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">0.5 = Auto-sell at -50% loss</p>
        </div>

        <div className="rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
            Max Daily Loss Limit (SOL)
          </label>
          <input 
            type="number" 
            step="0.1"
            min="0.1"
            value={maxDailyLoss}
            onChange={e => setMaxDailyLoss(parseFloat(e.target.value))}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">Pause strategy if daily loss hits threshold</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button 
          onClick={saveSettings}
          disabled={loading}
          className="rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Syncing & Saving..." : "Save & Sync Strategy with Helius"}
        </button>
      </div>
    </div>
  );
}

