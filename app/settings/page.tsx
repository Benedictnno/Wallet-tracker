"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SettingsState = {
  liveTradeEnabled: boolean;
  globalMaxOpenPositions: number;
  globalDailyLossSol: number;
  hasTelegram: boolean;
  hasDiscord: boolean;
  telegramChatId: string | null;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    liveTradeEnabled: false,
    globalMaxOpenPositions: 5,
    globalDailyLossSol: 2.0,
    hasTelegram: false,
    hasDiscord: false,
    telegramChatId: null,
  });

  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        if (data.telegramChatId) setTelegramChatId(data.telegramChatId);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liveTradeEnabled: settings.liveTradeEnabled,
          globalMaxOpenPositions: settings.globalMaxOpenPositions,
          globalDailyLossSol: settings.globalDailyLossSol,
          telegramBotToken: telegramBotToken || undefined,
          telegramChatId: telegramChatId || undefined,
          discordWebhookUrl: discordWebhookUrl || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setStatus({ type: "success", message: "Settings saved successfully!" });
        // Clear plaintext secrets from inputs after save
        setTelegramBotToken("");
        setDiscordWebhookUrl("");
      } else {
        setStatus({ type: "error", message: data.error || "Failed to save." });
      }
    } catch {
      setStatus({ type: "error", message: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl flex flex-col gap-8">
        {/* Header */}
        <div>
          <Link href="/" className="text-sm text-sky-700 hover:text-sky-800">
            ← Back to dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Global Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure the trading bot, notifications, and risk limits.
          </p>
        </div>

        {/* Status Banner */}
        {status && (
          <div
            className={`rounded-2xl px-5 py-4 text-sm font-medium ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
            }`}
          >
            {status.type === "success" ? "✅" : "❌"} {status.message}
          </div>
        )}

        {/* Live Trading Master Switch */}
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            ⚡ Live Trading Mode
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            When disabled, the bot runs in paper/simulation mode only. No real transactions will be executed.
          </p>
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/5">
            <div>
              <p className="font-semibold text-slate-200">
                {settings.liveTradeEnabled ? "🟢 LIVE TRADING ENABLED" : "📄 PAPER MODE (Safe)"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {settings.liveTradeEnabled
                  ? "Real SOL will be spent on trades. Be careful!"
                  : "Trades will only be simulated and logged."}
              </p>
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, liveTradeEnabled: !s.liveTradeEnabled }))}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
                settings.liveTradeEnabled ? "bg-sky-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                  settings.liveTradeEnabled ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </section>

        {/* Risk Limits */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Global Risk Limits</h2>
          <p className="mt-1 text-sm text-slate-500">
            These limits apply across all wallets you are copy-trading.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Max Open Positions
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={settings.globalMaxOpenPositions}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, globalMaxOpenPositions: parseInt(e.target.value) }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
              />
              <p className="mt-1 text-xs text-slate-400">
                Pause all copy trading when this many positions are open.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Global Daily Loss Cap (SOL)
              </label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={settings.globalDailyLossSol}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, globalDailyLossSol: parseFloat(e.target.value) }))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
              />
              <p className="mt-1 text-xs text-slate-400">
                Halt all trading if cumulative daily losses exceed this amount.
              </p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
          <p className="mt-1 text-sm text-slate-500">
            Get instant alerts when trades execute, fail, or hit TP/SL.
          </p>

          {/* Telegram */}
          <div className="mt-5 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600 text-lg">
                ✈️
              </div>
              <div>
                <p className="font-medium text-slate-900">Telegram</p>
                <p className="text-xs text-slate-500">
                  {settings.hasTelegram ? "✅ Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Bot Token
                </label>
                <input
                  type="password"
                  placeholder={settings.hasTelegram ? "Leave blank to keep existing" : "123456:ABC-DEF..."}
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Chat ID
                </label>
                <input
                  type="text"
                  placeholder={settings.hasTelegram ? settings.telegramChatId ?? "e.g. -1001234567890" : "e.g. -1001234567890"}
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
                />
              </div>
            </div>
          </div>

          {/* Discord */}
          <div className="mt-4 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 text-lg">
                💬
              </div>
              <div>
                <p className="font-medium text-slate-900">Discord</p>
                <p className="text-xs text-slate-500">
                  {settings.hasDiscord ? "✅ Connected" : "Not connected"}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">
                Webhook URL
              </label>
              <input
                type="password"
                placeholder={settings.hasDiscord ? "Leave blank to keep existing" : "https://discord.com/api/webhooks/..."}
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
              />
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end pb-6">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-slate-900 px-8 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </main>
  );
}
