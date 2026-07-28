import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const settings = await prisma.globalSettings.findUnique({
      where: { id: "singleton" },
    });

    // Mask sensitive fields before sending to client
    return NextResponse.json({
      liveTradeEnabled: settings?.liveTradeEnabled ?? false,
      globalMaxOpenPositions: settings?.globalMaxOpenPositions ?? 5,
      globalDailyLossSol: settings?.globalDailyLossSol ?? 2.0,
      hasTelegram: !!(settings?.telegramBotToken && settings?.telegramChatId),
      hasDiscord: !!settings?.discordWebhookUrl,
      // Masked tokens (just show last 4 chars so user knows they're set)
      telegramBotTokenHint: settings?.telegramBotToken
        ? `...${settings.telegramBotToken.slice(-4)}`
        : null,
      telegramChatId: settings?.telegramChatId ?? null,
      discordWebhookHint: settings?.discordWebhookUrl
        ? `...${settings.discordWebhookUrl.slice(-8)}`
        : null,
    });
  } catch (error) {
    console.error("[Settings API] GET error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      liveTradeEnabled,
      globalMaxOpenPositions,
      globalDailyLossSol,
      telegramBotToken,
      telegramChatId,
      discordWebhookUrl,
    } = body;

    const updateData: Record<string, unknown> = {};

    if (typeof liveTradeEnabled === "boolean") updateData.liveTradeEnabled = liveTradeEnabled;
    if (typeof globalMaxOpenPositions === "number") updateData.globalMaxOpenPositions = globalMaxOpenPositions;
    if (typeof globalDailyLossSol === "number") updateData.globalDailyLossSol = globalDailyLossSol;
    // Only update secret fields if a non-empty value is provided (empty = keep existing)
    if (telegramBotToken !== undefined && telegramBotToken !== "") updateData.telegramBotToken = telegramBotToken;
    if (telegramChatId !== undefined && telegramChatId !== "") updateData.telegramChatId = telegramChatId;
    if (discordWebhookUrl !== undefined && discordWebhookUrl !== "") updateData.discordWebhookUrl = discordWebhookUrl;
    // Explicit clear
    if (telegramBotToken === "") updateData.telegramBotToken = null;
    if (telegramChatId === "") updateData.telegramChatId = null;
    if (discordWebhookUrl === "") updateData.discordWebhookUrl = null;

    const settings = await prisma.globalSettings.upsert({
      where: { id: "singleton" },
      update: updateData,
      create: {
        id: "singleton",
        liveTradeEnabled: liveTradeEnabled ?? false,
        globalMaxOpenPositions: globalMaxOpenPositions ?? 5,
        globalDailyLossSol: globalDailyLossSol ?? 2.0,
        telegramBotToken: telegramBotToken || null,
        telegramChatId: telegramChatId || null,
        discordWebhookUrl: discordWebhookUrl || null,
      },
    });

    return NextResponse.json({
      success: true,
      liveTradeEnabled: settings.liveTradeEnabled,
      globalMaxOpenPositions: settings.globalMaxOpenPositions,
      globalDailyLossSol: settings.globalDailyLossSol,
      hasTelegram: !!(settings.telegramBotToken && settings.telegramChatId),
      hasDiscord: !!settings.discordWebhookUrl,
    });
  } catch (error) {
    console.error("[Settings API] POST error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
