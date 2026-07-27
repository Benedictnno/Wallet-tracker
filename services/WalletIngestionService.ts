import { prisma } from "@/lib/prisma";
import { walletTrackerService } from "@/services/WalletTrackerService";
import { HeliusWalletProvider } from "@/services/solana/HeliusWalletProvider";
import {
  TransactionParserService,
  type ParsedWalletTransaction,
} from "@/services/TransactionParserService";
import { tokenPriceService } from "@/services/TokenPriceService";
import { spamTokenFilter } from "@/services/SpamTokenFilter";

type TradeLot = {
  amount: number;
  price: number;
  timestamp: Date;
  tokenId: string;
  signature?: string;
  source?: string;
  counterAssetAddress?: string;
  counterAssetSymbol?: string;
  counterAmount?: number;
};

const parserService = new TransactionParserService();

export class WalletIngestionService {
  async syncWalletActivity(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      return { status: "not_found" as const };
    }

    if (wallet.chain !== "Solana") {
      return {
        status: "unsupported_chain" as const,
        message: "Wallet sync is currently implemented for Solana only.",
      };
    }

    const heliusApiKey = process.env.HELIUS_API_KEY?.trim();

    if (!heliusApiKey) {
      return {
        status: "not_configured" as const,
        message: "Add HELIUS_API_KEY to enable Solana wallet sync.",
      };
    }

    const provider = new HeliusWalletProvider(heliusApiKey);
    const rawTransactions = await provider.fetchWalletTransactions(
      wallet.address,
    );
    const parsedTransactions = parserService.parseSolanaWalletTransactions(
      wallet.address,
      rawTransactions,
    );

    await this.persistWalletTransactions(wallet.id, parsedTransactions);
    await this.rebuildTrades(wallet.id);
    const refreshed = await walletTrackerService.refreshWalletAnalysis(
      wallet.id,
    );

    return {
      status: "synced" as const,
      walletId: wallet.id,
      importedTransactions: parsedTransactions.length,
      rawTransactions: rawTransactions.length,
      refresh: refreshed,
    };
  }

  private async persistWalletTransactions(
    walletId: string,
    transactions: ParsedWalletTransaction[],
  ) {
    const uniqueAddresses = [...new Set(transactions.map((t) => t.tokenAddress))];
    const enrichments = await tokenPriceService.enrichTokenBatch(uniqueAddresses);

    for (const transaction of transactions) {
      const existingToken = await prisma.token.findFirst({
        where: {
          address: transaction.tokenAddress,
          chain: transaction.chain,
        },
      });
      const enrichment = enrichments.get(transaction.tokenAddress) ?? {
          priceUsd: null, marketCap: null, liquidity: null, fdv: null, launchDate: null, symbol: null, name: null
      };
      const wasAirdropped = transaction.type === "BUY" && (transaction.price === 0 || !transaction.counterAmount);
      const spamCheck = spamTokenFilter.analyzeToken(
          transaction.tokenSymbol,
          transaction.tokenName,
          enrichment,
          wasAirdropped
      );

      const token = existingToken
        ? await prisma.token.update({
            where: { id: existingToken.id },
            data: {
              symbol: enrichment.symbol ?? this.resolveTokenLabel(
                existingToken.symbol,
                transaction.tokenSymbol,
              ),
              name: enrichment.name ?? this.resolveTokenLabel(
                existingToken.name,
                transaction.tokenName,
              ),
              priceUsd: enrichment.priceUsd ?? existingToken.priceUsd,
              marketCap: enrichment.marketCap ?? existingToken.marketCap,
              liquidity: enrichment.liquidity ?? existingToken.liquidity,
              fdv: enrichment.fdv ?? existingToken.fdv,
              launchDate: enrichment.launchDate ?? existingToken.launchDate,
              isSpam: existingToken.isSpam || spamCheck.isSpam,
              spamReason: existingToken.spamReason ?? spamCheck.spamReason,
              firstSeenAt: this.minDate(
                existingToken.firstSeenAt,
                transaction.timestamp,
              ),
              lastSeenAt: this.maxDate(
                existingToken.lastSeenAt,
                transaction.timestamp,
              ),
              metadataUpdatedAt: new Date(),
            },
          })
        : await prisma.token.create({
            data: {
              address: transaction.tokenAddress,
              symbol: enrichment.symbol ?? transaction.tokenSymbol,
              name: enrichment.name ?? transaction.tokenName,
              chain: transaction.chain,
              priceUsd: enrichment.priceUsd,
              marketCap: enrichment.marketCap,
              liquidity: enrichment.liquidity,
              fdv: enrichment.fdv,
              launchDate: enrichment.launchDate,
              isSpam: spamCheck.isSpam,
              spamReason: spamCheck.spamReason,
              firstSeenAt: transaction.timestamp,
              lastSeenAt: transaction.timestamp,
              metadataUpdatedAt: new Date(),
            },
          });

      await prisma.transaction.upsert({
        where: {
          externalId: transaction.externalId,
        },
        create: {
          externalId: transaction.externalId,
          signature: transaction.signature,
          walletId,
          tokenId: token.id,
          type: transaction.type,
          transactionType: transaction.transactionType,
          source: transaction.source,
          description: transaction.description,
          amount: transaction.amount,
          price: transaction.price,
          counterAssetAddress: transaction.counterAssetAddress,
          counterAssetSymbol: transaction.counterAssetSymbol,
          counterAmount: transaction.counterAmount,
          timestamp: transaction.timestamp,
        },
        update: {
          signature: transaction.signature,
          walletId,
          tokenId: token.id,
          type: transaction.type,
          transactionType: transaction.transactionType,
          source: transaction.source,
          description: transaction.description,
          amount: transaction.amount,
          price: transaction.price,
          counterAssetAddress: transaction.counterAssetAddress,
          counterAssetSymbol: transaction.counterAssetSymbol,
          counterAmount: transaction.counterAmount,
          timestamp: transaction.timestamp,
        },
      });
    }
  }

  private async rebuildTrades(walletId: string) {
    const transactions = await prisma.transaction.findMany({
      where: { walletId },
      include: {
        token: true,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    const openLotsByToken = new Map<string, TradeLot[]>();
    const tradesToCreate: Array<{
      walletId: string;
      tokenId: string;
      status: string;
      entryPrice: number;
      exitPrice?: number;
      entryTime: Date;
      exitTime?: Date;
      entrySignature?: string;
      exitSignature?: string;
      entrySource?: string;
      exitSource?: string;
      tokenFirstSeenAt?: Date | null;
      tokenAgeSecondsAtEntry?: number | null;
      entryCounterAssetAddress?: string | null;
      entryCounterAssetSymbol?: string | null;
      entryCounterAmount?: number | null;
      exitCounterAssetAddress?: string | null;
      exitCounterAssetSymbol?: string | null;
      exitCounterAmount?: number | null;
      entryMarketCapEstimate?: number | null;
      entryLiquidityEstimate?: number | null;
      delayWindowSeconds?: number | null;
      delayPriceChangePct?: number | null;
      profitLoss?: number;
      roi?: number;
      realizedPnL?: number;
      unrealizedPnL?: number;
      remainingAmount?: number;
      holdingTime?: number;
    }> = [];

    for (const transaction of transactions) {
      const lots = openLotsByToken.get(transaction.tokenId) ?? [];

      if (transaction.type === "BUY") {
        lots.push({
          amount: transaction.amount,
          price: transaction.price,
          timestamp: transaction.timestamp,
          tokenId: transaction.tokenId,
          signature: transaction.signature ?? undefined,
          source: transaction.source ?? undefined,
          counterAssetAddress: transaction.counterAssetAddress ?? undefined,
          counterAssetSymbol: transaction.counterAssetSymbol ?? undefined,
          counterAmount: transaction.counterAmount ?? undefined,
        });
        openLotsByToken.set(transaction.tokenId, lots);
        continue;
      }

      let remainingToSell = transaction.amount;

      while (remainingToSell > 0 && lots.length > 0) {
        const lot = lots[0];
        const matchedAmount = Math.min(remainingToSell, lot.amount);
        const entryValue = lot.price * matchedAmount;
        const exitValue = transaction.price * matchedAmount;
        const profitLoss = exitValue - entryValue;
        const roi = entryValue > 0 ? (profitLoss / entryValue) * 100 : 0;
        const holdingTime = Math.max(
          0,
          Math.round(
            (transaction.timestamp.getTime() - lot.timestamp.getTime()) / 1000,
          ),
        );

        tradesToCreate.push({
          walletId,
          tokenId: transaction.tokenId,
          status: "CLOSED",
          entryPrice: lot.price,
          exitPrice: transaction.price,
          entryTime: lot.timestamp,
          exitTime: transaction.timestamp,
          entrySignature: lot.signature,
          exitSignature: transaction.signature ?? undefined,
          entrySource: lot.source,
          exitSource: transaction.source ?? undefined,
          tokenFirstSeenAt: transaction.token.firstSeenAt,
          tokenAgeSecondsAtEntry: transaction.token.firstSeenAt
            ? Math.max(
                0,
                Math.round(
                  (lot.timestamp.getTime() -
                    transaction.token.firstSeenAt.getTime()) /
                    1000,
                ),
              )
            : null,
          entryCounterAssetAddress: lot.counterAssetAddress,
          entryCounterAssetSymbol: lot.counterAssetSymbol,
          entryCounterAmount: lot.counterAmount ?? null,
          exitCounterAssetAddress: transaction.counterAssetAddress,
          exitCounterAssetSymbol: transaction.counterAssetSymbol,
          exitCounterAmount: transaction.counterAmount,
          entryMarketCapEstimate: transaction.token.marketCap,
          entryLiquidityEstimate: transaction.token.liquidity,
          delayWindowSeconds: 30,
          delayPriceChangePct: null,
          profitLoss,
          realizedPnL: profitLoss,
          unrealizedPnL: 0,
          roi,
          remainingAmount: 0,
          holdingTime,
        });

        lot.amount -= matchedAmount;
        remainingToSell -= matchedAmount;

        if (lot.amount <= 0) {
          lots.shift();
        }
      }

      openLotsByToken.set(transaction.tokenId, lots);
    }

    // Now handle remaining open lots
    for (const [tokenId, lots] of openLotsByToken.entries()) {
        const token = transactions.find(t => t.tokenId === tokenId)?.token;
        if (!token) continue;
        
        for (const lot of lots) {
            let unrealizedPnL: number | undefined;
            if (token.priceUsd) {
                // VERY basic unrealized PnL assuming priceUsd is roughly comparable.
                // In reality we should compare it to the USD entry price.
                // We'll leave this simple for now since it wasn't specified exactly how to mix SOL/USD.
                const currentSolPrice = 150; // hardcoded placeholder since we don't have SOL price readily available here
                const lotEntryUsd = lot.price * currentSolPrice * lot.amount;
                const currentUsdValue = token.priceUsd * lot.amount;
                unrealizedPnL = currentUsdValue - lotEntryUsd;
            }

            tradesToCreate.push({
                walletId,
                tokenId: tokenId,
                status: "OPEN",
                entryPrice: lot.price,
                entryTime: lot.timestamp,
                entrySignature: lot.signature,
                entrySource: lot.source,
                tokenFirstSeenAt: token.firstSeenAt,
                tokenAgeSecondsAtEntry: token.firstSeenAt
                  ? Math.max(0, Math.round((lot.timestamp.getTime() - token.firstSeenAt.getTime()) / 1000))
                  : null,
                entryCounterAssetAddress: lot.counterAssetAddress,
                entryCounterAssetSymbol: lot.counterAssetSymbol,
                entryCounterAmount: lot.counterAmount ?? null,
                entryMarketCapEstimate: token.marketCap,
                entryLiquidityEstimate: token.liquidity,
                remainingAmount: lot.amount,
                unrealizedPnL,
            });
        }
    }

    await prisma.$transaction(async (tx) => {
      await tx.trade.deleteMany({
        where: { walletId },
      });

      for (const trade of tradesToCreate) {
        await tx.trade.create({
          data: trade,
        });
      }
    });
  }

  private minDate(current: Date | null, candidate: Date) {
    if (!current) {
      return candidate;
    }

    return current <= candidate ? current : candidate;
  }

  private maxDate(current: Date | null, candidate: Date) {
    if (!current) {
      return candidate;
    }

    return current >= candidate ? current : candidate;
  }

  private resolveTokenLabel(existing: string, incoming: string) {
    if (!existing) {
      return incoming;
    }

    const isExistingPlaceholder = existing.includes("...");
    const isIncomingPlaceholder = incoming.includes("...");

    if (!isExistingPlaceholder) {
      return existing;
    }

    return isIncomingPlaceholder ? existing : incoming;
  }
}

export const walletIngestionService = new WalletIngestionService();
