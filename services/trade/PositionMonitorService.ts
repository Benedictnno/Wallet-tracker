import { prisma } from "../../lib/prisma";
import { tokenPriceService } from "../TokenPriceService";
import { jupiterTradeService } from "./JupiterTradeService";
import { globalRiskGuard } from "./GlobalRiskGuard";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export type PositionEvaluationResult = {
  walletId: string;
  tokenId: string;
  tokenSymbol: string;
  buyRecordId: string;
  entryPriceUsd: number;
  currentPriceUsd: number;
  pnlPct: number;
  actionTaken: "TAKE_PROFIT" | "STOP_LOSS" | "NONE";
  sellRecordId?: string;
};

export class PositionMonitorService {
  /**
   * Evaluate all active copy-traded BUY positions against Take-Profit and Stop-Loss thresholds.
   */
  async evaluatePositions(): Promise<PositionEvaluationResult[]> {
    const results: PositionEvaluationResult[] = [];

    try {
      // Find all active copy trade settings
      const activeSettings = await prisma.copyTradeSettings.findMany({
        where: { enabled: true },
        include: { wallet: true },
      });

      for (const setting of activeSettings) {
        // Find open BUY execution records for this wallet that haven't been sold yet
        const buyRecords = await prisma.executionRecord.findMany({
          where: {
            walletId: setting.walletId,
            type: "BUY",
            status: { in: ["SIMULATED", "EXECUTED"] },
          },
          include: { token: true },
          orderBy: { timestamp: "desc" },
        });

        for (const buyRecord of buyRecords) {
          // Check if this BUY record already has a corresponding SELL execution record
          const existingSell = await prisma.executionRecord.findFirst({
            where: {
              walletId: setting.walletId,
              tokenId: buyRecord.tokenId,
              type: "SELL",
              targetTradeId: { startsWith: `SELL_${buyRecord.id}` },
            },
          });

          if (existingSell) {
            continue; // Position is already closed
          }

          // Fetch current market price for token
          const enrichment = await tokenPriceService.enrichToken(buyRecord.token.address);
          const currentPrice = enrichment.priceUsd ?? buyRecord.token.priceUsd ?? 0;
          const recordExecPrice = buyRecord.executionPrice ?? 0;
          const entryPrice = recordExecPrice > 0 
            ? recordExecPrice 
            : (buyRecord.token.priceUsd || currentPrice);

          if (entryPrice <= 0 || currentPrice <= 0) {
            continue; // Unable to calculate PnL without prices
          }

          // Return PnL %
          const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;

          // Check TP and SL conditions
          // takeProfitPct and stopLossPct are always stored as a percentage
          // (e.g. 200 = 200% gain = 2x, 50 = 50% loss).
          // Older records may have used a multiplier (2.0 = 2x); normalise here.
          const targetTakeProfit = setting.takeProfitPct < 10
            ? setting.takeProfitPct * 100   // legacy multiplier → convert to %
            : setting.takeProfitPct;        // already a percentage
          const targetStopLoss = setting.stopLossPct < 1
            ? setting.stopLossPct * 100     // legacy multiplier → convert to %
            : setting.stopLossPct;          // already a percentage

          let actionTaken: "TAKE_PROFIT" | "STOP_LOSS" | "NONE" = "NONE";

          if (pnlPct >= targetTakeProfit) {
            actionTaken = "TAKE_PROFIT";
          } else if (pnlPct <= -targetStopLoss) {
            actionTaken = "STOP_LOSS";
          }

          let sellRecordId: string | undefined;

          if (actionTaken !== "NONE") {
            // --- GLOBAL RISK GUARD for auto-exit ---
            const riskCheck = await globalRiskGuard.checkSellAllowed();
            if (!riskCheck.allowed) {
              console.warn(`[PositionMonitorService] Auto-exit BLOCKED by risk guard: ${riskCheck.reason}`);
              results.push({
                walletId: setting.walletId,
                tokenId: buyRecord.tokenId,
                tokenSymbol: buyRecord.token.symbol,
                buyRecordId: buyRecord.id,
                entryPriceUsd: entryPrice,
                currentPriceUsd: currentPrice,
                pnlPct,
                actionTaken: "NONE",
              });
              continue;
            }

            const amountTokenToSell = buyRecord.amountToken || 0;
            let execStatus = "SIMULATED";
            let execError = null;
            let finalTradeId = `SELL_${buyRecord.id}`;
            let executionPriceSol = currentPrice;
            let slippageTaken = setting.slippageBps / 10000;
            let amountSol = buyRecord.amountSol * (1 + pnlPct / 100);

            const wallet = jupiterTradeService.getWalletFromEnv();

            // Fetch Jupiter quote to exit position
            try {
              if (amountTokenToSell > 0) {
                // Since we don't have token decimals easily accessible here, we'll assume the amountToken is raw or formatted.
                // In a production environment with SPL balances, we would fetch the user's SPL token balance via RPC.
                // For now, we fetch quote assuming amountToken is raw.
                const quote = await jupiterTradeService.getQuote({
                  inputMint: buyRecord.token.address,
                  outputMint: NATIVE_SOL_MINT,
                  amountLamports: amountTokenToSell, // Assumes this was saved as raw units
                  slippageBps: setting.slippageBps
                });

                if (quote) {
                  amountSol = quote.outAmountFormatted;
                  executionPriceSol = quote.pricePerTokenSol;
                  slippageTaken = quote.priceImpactPct;

                  // Attempt live execution
                  if (wallet && quote.rawQuote) {
                    console.log(`[PositionMonitorService] [LIVE TRADE] Executing AUTO-EXIT for ${buyRecord.token.symbol}`);
                    try {
                      const liveTxid = await jupiterTradeService.executeSwap(quote.rawQuote);
                      execStatus = "EXECUTED";
                      finalTradeId = liveTxid;
                      console.log(`[PositionMonitorService] [LIVE TRADE] Success! TxID: ${liveTxid}`);
                    } catch (err: any) {
                      console.error(`[PositionMonitorService] [LIVE TRADE] Failed:`, err);
                      execStatus = "FAILED";
                      execError = err.message || "Unknown execution error";
                    }
                  }
                }
              }
            } catch (err) {
              console.warn(`[PositionMonitorService] Jupiter quote/swap fallback used:`, err);
            }

            if (execStatus === "SIMULATED" && execError === null) {
              execError = `Auto-Exit Triggered: ${actionTaken} at ${pnlPct.toFixed(1)}% PnL (Simulated)`;
            }

            const sellRecord = await prisma.executionRecord.create({
              data: {
                walletId: setting.walletId,
                tokenId: buyRecord.tokenId,
                targetTradeId: finalTradeId,
                type: "SELL",
                status: execStatus,
                amountSol: amountSol,
                amountToken: amountTokenToSell,
                executionPrice: executionPriceSol,
                slippageTaken: slippageTaken,
                errorReason: execError,
                pairedBuyId: buyRecord.id, // hard-link to the BUY this auto-exit closes
              },
            });
            sellRecordId = sellRecord.id;
            console.log(`[PositionMonitorService] AUTO-EXIT Executed: ${actionTaken} for ${buyRecord.token.symbol} (${pnlPct.toFixed(2)}% PnL)`);
          }

          results.push({
            walletId: setting.walletId,
            tokenId: buyRecord.tokenId,
            tokenSymbol: buyRecord.token.symbol,
            buyRecordId: buyRecord.id,
            entryPriceUsd: entryPrice,
            currentPriceUsd: currentPrice,
            pnlPct,
            actionTaken,
            sellRecordId,
          });
        }
      }
    } catch (error) {
      console.error("[PositionMonitorService] Error evaluating positions:", error);
    }

    return results;
  }
}

export const positionMonitorService = new PositionMonitorService();
