import { prisma } from "../../lib/prisma";
import { HeliusEnhancedTransaction } from "../solana/HeliusWalletProvider";
import { jupiterTradeService } from "./JupiterTradeService";
import { tokenPriceService } from "../TokenPriceService";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export class CopyTradeService {
  /**
   * Process an incoming webhook from Helius.
   * This should be called immediately by the API route.
   */
  async processIncomingWebhook(transactions: HeliusEnhancedTransaction[]) {
    console.log(`[CopyTradeService] Received ${transactions.length} transactions from webhook`);
    
    for (const tx of transactions) {
      try {
        await this.processSingleTransaction(tx);
      } catch (e) {
        console.error(`[CopyTradeService] Error processing tx ${tx.signature}:`, e);
      }
    }
  }

  private async processSingleTransaction(tx: HeliusEnhancedTransaction) {
    if (!tx.events?.swap) return; // Only care about swaps for copy trading

    const swap = tx.events.swap;
    const isNativeInput = !!swap.nativeInput;
    const isNativeOutput = !!swap.nativeOutput;
    
    if (!isNativeInput && !isNativeOutput) {
      // Not swapping against SOL, ignore for now to avoid complex routing
      return;
    }

    // Identify the user's wallet address from the swap event
    let targetWalletAddress = '';
    if (swap.tokenInputs && swap.tokenInputs.length > 0 && swap.tokenInputs[0].userAccount) {
      targetWalletAddress = swap.tokenInputs[0].userAccount;
    } else if (swap.tokenOutputs && swap.tokenOutputs.length > 0 && swap.tokenOutputs[0].userAccount) {
      targetWalletAddress = swap.tokenOutputs[0].userAccount;
    } else if (isNativeInput && swap.nativeInput?.account) {
      targetWalletAddress = swap.nativeInput.account;
    } else if (isNativeOutput && swap.nativeOutput?.account) {
      targetWalletAddress = swap.nativeOutput.account;
    }

    if (!targetWalletAddress) return;

    // Check if we are actively copy-trading this wallet
    const settings = await prisma.copyTradeSettings.findFirst({
      where: {
        wallet: { address: targetWalletAddress },
        enabled: true,
      },
      include: { wallet: true }
    });

    if (!settings) return; // Not copying this wallet

    console.log(`[CopyTradeService] TARGET DETECTED: Wallet ${targetWalletAddress} executed a swap!`);

    // Determine Buy or Sell
    const type = isNativeInput ? 'BUY' : 'SELL';
    
    // Extract token mint address
    let tokenMint = '';
    let targetTokenAmount = 0;
    if (type === 'BUY' && swap.tokenOutputs && swap.tokenOutputs.length > 0) {
      const out = swap.tokenOutputs[0];
      if (out.mint) tokenMint = out.mint;
      if (out.rawTokenAmount?.tokenAmount && out.rawTokenAmount.decimals != null) {
        targetTokenAmount = parseFloat(out.rawTokenAmount.tokenAmount) / Math.pow(10, out.rawTokenAmount.decimals);
      }
    } else if (type === 'SELL' && swap.tokenInputs && swap.tokenInputs.length > 0) {
      const inp = swap.tokenInputs[0];
      if (inp.mint) tokenMint = inp.mint;
      if (inp.rawTokenAmount?.tokenAmount && inp.rawTokenAmount.decimals != null) {
        targetTokenAmount = parseFloat(inp.rawTokenAmount.tokenAmount) / Math.pow(10, inp.rawTokenAmount.decimals);
      }
    }

    if (!tokenMint) return;

    // Ensure the token exists in our DB (or create a stub)
    let token = await prisma.token.findUnique({
      where: { address_chain: { address: tokenMint, chain: 'Solana' } }
    });

    if (!token) {
      const enriched = await tokenPriceService.enrichToken(tokenMint);
      token = await prisma.token.create({
        data: {
          address: tokenMint,
          symbol: enriched.symbol || 'UNKNOWN',
          name: enriched.name || 'Unknown Token',
          priceUsd: enriched.priceUsd,
          liquidity: enriched.liquidity,
          marketCap: enriched.marketCap,
          chain: 'Solana',
          firstSeenAt: new Date()
        }
      });
    }

    // Prevent duplicate processing
    const existing = await prisma.executionRecord.findFirst({
      where: {
        walletId: settings.wallet.id,
        targetTradeId: tx.signature // Using signature as targetTradeId
      }
    });

    if (existing) {
      console.log(`[CopyTradeService] Already processed signature ${tx.signature}`);
      return;
    }

    // --- Execution Sizing ---
    const tradeAmountSol = settings.defaultTradeSize;
    const slippageBps = settings.slippageBps || 300;

    // Fetch live Jupiter quote for precision execution
    let calculatedAmountToken = targetTokenAmount;
    let executionPriceSol = 0;
    let slippageTaken = (slippageBps / 10000) * 100;
    let quoteData = null;

    try {
      const inputMint = type === 'BUY' ? NATIVE_SOL_MINT : tokenMint;
      const outputMint = type === 'BUY' ? tokenMint : NATIVE_SOL_MINT;
      const lamports = jupiterTradeService.solToLamports(tradeAmountSol);

      const quote = await jupiterTradeService.getQuote({
        inputMint,
        outputMint,
        amountLamports: lamports,
        slippageBps
      });

      if (quote) {
        calculatedAmountToken = quote.outAmountFormatted;
        executionPriceSol = quote.pricePerTokenSol;
        slippageTaken = quote.priceImpactPct;
        quoteData = quote;
      }
    } catch (err) {
      console.warn(`[CopyTradeService] Jupiter quote fallback used:`, err);
    }

    // --- LIVE VS SIMULATED EXECUTION ---
    let execStatus = 'SIMULATED';
    let execError = null;
    let finalTradeId = tx.signature; // Default to target's signature for simulated

    const wallet = jupiterTradeService.getWalletFromEnv();
    
    if (wallet && quoteData?.rawQuote) {
      console.log(`[CopyTradeService] [LIVE TRADE] Executing ${type} of ${tokenMint} with ${tradeAmountSol} SOL on mainnet`);
      try {
        const liveTxid = await jupiterTradeService.executeSwap(quoteData.rawQuote);
        execStatus = 'EXECUTED';
        finalTradeId = liveTxid;
        console.log(`[CopyTradeService] [LIVE TRADE] Success! TxID: ${liveTxid}`);
      } catch (err: any) {
        console.error(`[CopyTradeService] [LIVE TRADE] Failed:`, err);
        execStatus = 'FAILED';
        execError = err.message || "Unknown execution error";
      }
    } else {
      console.log(`[CopyTradeService] [PAPER TRADE] Simulating ${type} of ${tokenMint} with ${tradeAmountSol} SOL`);
    }
    
    const record = await prisma.executionRecord.create({
      data: {
        walletId: settings.wallet.id,
        targetTradeId: finalTradeId,
        tokenId: token.id,
        status: execStatus,
        type: type,
        amountSol: tradeAmountSol,
        amountToken: calculatedAmountToken,
        executionPrice: executionPriceSol,
        slippageTaken: slippageTaken,
        errorReason: execError
      }
    });

    console.log(`[CopyTradeService] Recorded execution ID ${record.id} in DB.`);
  }
}

export const copyTradeService = new CopyTradeService();
