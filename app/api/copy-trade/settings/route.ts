import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { HeliusWalletProvider } from '@/services/solana/HeliusWalletProvider';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      walletId, 
      enabled, 
      defaultTradeSize, 
      slippageBps, 
      takeProfitPct, 
      stopLossPct, 
      maxDailyLoss,
      webhookUrl: userWebhookUrl 
    } = body;

    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 });
    }

    const updateData: any = {};
    if (typeof enabled === 'boolean') updateData.enabled = enabled;
    if (typeof defaultTradeSize === 'number') updateData.defaultTradeSize = defaultTradeSize;
    if (typeof slippageBps === 'number') updateData.slippageBps = slippageBps;
    if (typeof takeProfitPct === 'number') updateData.takeProfitPct = takeProfitPct;
    if (typeof stopLossPct === 'number') updateData.stopLossPct = stopLossPct;
    if (typeof maxDailyLoss === 'number') updateData.maxDailyLoss = maxDailyLoss;

    const settings = await prisma.copyTradeSettings.upsert({
      where: { walletId },
      update: updateData,
      create: { 
        walletId, 
        enabled: enabled ?? false, 
        defaultTradeSize: defaultTradeSize ?? 0.1,
        slippageBps: slippageBps ?? 300,
        takeProfitPct: takeProfitPct ?? 2.0,
        stopLossPct: stopLossPct ?? 0.5,
        maxDailyLoss: maxDailyLoss ?? 0.5,
      }
    });

    // Determine public Webhook URL
    let webhookUrl = userWebhookUrl;
    if (!webhookUrl) {
      const host = req.headers.get('host') || 'localhost:3000';
      const proto = req.headers.get('x-forwarded-proto') || 'http';
      webhookUrl = `${proto}://${host}/api/webhooks/helius`;
    }

    // Auto-sync with Helius API
    let heliusSync: any = { success: false, reason: 'HELIUS_API_KEY not configured' };
    const apiKey = process.env.HELIUS_API_KEY;

    if (apiKey) {
      // Find all wallets on Solana where copy trading is enabled
      const enabledWallets = await prisma.wallet.findMany({
        where: {
          chain: 'Solana',
          copyTradeSettings: { enabled: true }
        },
        select: { address: true }
      });

      const addressesToTrack = Array.from(new Set(enabledWallets.map(w => w.address)));
      const heliusProvider = new HeliusWalletProvider(apiKey);
      
      try {
        heliusSync = await heliusProvider.syncTrackedWallets(webhookUrl, addressesToTrack);
      } catch (err: any) {
        console.error('[Helius Webhook Auto-Sync Error]', err);
        heliusSync = { success: false, error: err?.message || 'Sync failed' };
      }
    }

    return NextResponse.json({ settings, heliusSync });
  } catch (error) {
    console.error('[CopyTrade Settings API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

