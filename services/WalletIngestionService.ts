import { prisma } from "@/lib/prisma";
import { walletTrackerService } from "@/services/WalletTrackerService";
import { HeliusWalletProvider } from "@/services/solana/HeliusWalletProvider";
import {
  TransactionParserService,
  type ParsedWalletTransaction,
} from "@/services/TransactionParserService";

type TradeLot = {
  amount: number;
  price: number;
  timestamp: Date;
  tokenId: string;
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
    const rawTransactions = await provider.fetchWalletTransactions(wallet.address);
    const parsedTransactions = parserService.parseSolanaWalletTransactions(
      wallet.address,
      rawTransactions
    );

    await this.persistWalletTransactions(wallet.id, parsedTransactions);
    await this.rebuildTrades(wallet.id);
    const refreshed = await walletTrackerService.refreshWalletAnalysis(wallet.id);

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
    transactions: ParsedWalletTransaction[]
  ) {
    for (const transaction of transactions) {
      const existingToken = await prisma.token.findFirst({
        where: {
          address: transaction.tokenAddress,
          chain: transaction.chain,
        },
      });
      const token = existingToken
        ? await prisma.token.update({
            where: { id: existingToken.id },
            data: {
              symbol: transaction.tokenSymbol,
              name: transaction.tokenName,
            },
          })
        : await prisma.token.create({
            data: {
              address: transaction.tokenAddress,
              symbol: transaction.tokenSymbol,
              name: transaction.tokenName,
              chain: transaction.chain,
            },
          });

      await prisma.transaction.upsert({
        where: {
          externalId: transaction.externalId,
        },
        create: {
          externalId: transaction.externalId,
          walletId,
          tokenId: token.id,
          type: transaction.type,
          amount: transaction.amount,
          price: transaction.price,
          timestamp: transaction.timestamp,
        },
        update: {
          walletId,
          tokenId: token.id,
          type: transaction.type,
          amount: transaction.amount,
          price: transaction.price,
          timestamp: transaction.timestamp,
        },
      });
    }
  }

  private async rebuildTrades(walletId: string) {
    const transactions = await prisma.transaction.findMany({
      where: { walletId },
      orderBy: {
        timestamp: "asc",
      },
    });

    const openLotsByToken = new Map<string, TradeLot[]>();
    const completedTrades: Array<{
      walletId: string;
      tokenId: string;
      entryPrice: number;
      exitPrice: number;
      entryTime: Date;
      exitTime: Date;
      profitLoss: number;
      roi: number;
      holdingTime: number;
    }> = [];

    for (const transaction of transactions) {
      const lots = openLotsByToken.get(transaction.tokenId) ?? [];

      if (transaction.type === "BUY") {
        lots.push({
          amount: transaction.amount,
          price: transaction.price,
          timestamp: transaction.timestamp,
          tokenId: transaction.tokenId,
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
            (transaction.timestamp.getTime() - lot.timestamp.getTime()) / 1000
          )
        );

        completedTrades.push({
          walletId,
          tokenId: transaction.tokenId,
          entryPrice: lot.price,
          exitPrice: transaction.price,
          entryTime: lot.timestamp,
          exitTime: transaction.timestamp,
          profitLoss,
          roi,
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

    await prisma.$transaction(async (tx) => {
      await tx.trade.deleteMany({
        where: { walletId },
      });

      for (const trade of completedTrades) {
        await tx.trade.create({
          data: trade,
        });
      }
    });
  }
}

export const walletIngestionService = new WalletIngestionService();
