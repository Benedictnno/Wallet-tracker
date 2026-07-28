/**
 * NotificationService
 * Sends trade alerts to Telegram and/or Discord.
 * Reads credentials from the GlobalSettings DB record (preferred) or env vars (fallback).
 */

import { prisma } from "@/lib/prisma";

type TradeNotificationPayload = {
  type: "BUY" | "SELL";
  status: "EXECUTED" | "SIMULATED" | "FAILED" | "PENDING";
  walletLabel?: string | null;
  walletAddress: string;
  tokenSymbol: string;
  tokenAddress: string;
  amountSol: number;
  amountToken?: number | null;
  executionPrice?: number | null;
  errorReason?: string | null;
  txId?: string | null;
};

function formatTradeMessage(payload: TradeNotificationPayload): string {
  const statusEmoji: Record<string, string> = {
    EXECUTED: "✅",
    SIMULATED: "📄",
    FAILED: "❌",
    PENDING: "⏳",
  };
  const typeEmoji = payload.type === "BUY" ? "🟢" : "🔴";
  const emoji = statusEmoji[payload.status] ?? "ℹ️";
  const walletName = payload.walletLabel || payload.walletAddress.slice(0, 8) + "...";
  const price = payload.executionPrice != null ? `@ $${payload.executionPrice.toFixed(8)}` : "";
  const tokenAmt = payload.amountToken != null ? `${payload.amountToken.toFixed(4)} ${payload.tokenSymbol}` : payload.tokenSymbol;

  let msg = `${emoji} ${typeEmoji} *${payload.status}* — Copy Trade Alert\n`;
  msg += `👛 Wallet: \`${walletName}\`\n`;
  msg += `🪙 Token: *${payload.tokenSymbol}* \`${payload.tokenAddress.slice(0, 8)}...\`\n`;
  msg += `💰 ${payload.type}: ${payload.amountSol} SOL → ${tokenAmt} ${price}\n`;

  if (payload.status === "EXECUTED" && payload.txId) {
    msg += `🔗 Tx: [View on Solscan](https://solscan.io/tx/${payload.txId})\n`;
  }
  if (payload.status === "FAILED" && payload.errorReason) {
    msg += `⚠️ Error: ${payload.errorReason}\n`;
  }

  return msg;
}

async function getSettings() {
  const dbSettings = await prisma.globalSettings.findUnique({
    where: { id: "singleton" },
  });
  return {
    telegramBotToken: dbSettings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || null,
    telegramChatId: dbSettings?.telegramChatId || process.env.TELEGRAM_CHAT_ID || null,
    discordWebhookUrl: dbSettings?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || null,
  };
}

async function sendTelegram(message: string, botToken: string, chatId: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[NotificationService] Telegram send failed:", err);
  }
}

async function sendDiscord(message: string, webhookUrl: string): Promise<void> {
  // Convert Markdown bold (*text*) to Discord bold (**text**) for compatibility
  const discordMessage = message.replace(/\*([^*]+)\*/g, "**$1**");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: discordMessage }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[NotificationService] Discord send failed:", err);
  }
}

export const notificationService = {
  /**
   * Send a trade execution notification to all configured channels.
   * Silently no-ops if no channels are configured.
   */
  async notifyTradeExecuted(payload: TradeNotificationPayload): Promise<void> {
    try {
      const settings = await getSettings();
      const message = formatTradeMessage(payload);
      const promises: Promise<void>[] = [];

      if (settings.telegramBotToken && settings.telegramChatId) {
        promises.push(sendTelegram(message, settings.telegramBotToken, settings.telegramChatId));
      }

      if (settings.discordWebhookUrl) {
        promises.push(sendDiscord(message, settings.discordWebhookUrl));
      }

      if (promises.length === 0) {
        // No notification channels configured — silently skip
        return;
      }

      await Promise.allSettled(promises);
    } catch (err) {
      // Never let notification failures crash the trade pipeline
      console.error("[NotificationService] Unexpected error:", err);
    }
  },
};
