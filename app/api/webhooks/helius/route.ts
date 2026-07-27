import { NextResponse } from 'next/server';
import { copyTradeService } from '@/services/trade/CopyTradeService';
import { HeliusEnhancedTransaction } from '@/services/solana/HeliusWalletProvider';

export async function POST(req: Request) {
  try {
    const transactions = await req.json() as HeliusEnhancedTransaction[];
    
    // We intentionally don't await this so we can return 200 OK immediately to Helius.
    // Webhooks require fast acknowledgement.
    copyTradeService.processIncomingWebhook(transactions).catch(e => {
      console.error('[Helius Webhook] Background processing error:', e);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Helius Webhook] Error processing payload:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
