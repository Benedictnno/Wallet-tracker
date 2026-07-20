import type { Token, Trade, Transaction } from "@prisma/client";

type TokenSnapshot = Pick<Token, "id" | "address" | "symbol" | "name" | "chain">;

type TransactionWithToken = Pick<
  Transaction,
  "id" | "type" | "amount" | "price" | "timestamp"
> & {
  token: TokenSnapshot;
};

type TradeWithToken = Pick<
  Trade,
  "id" | "entryPrice" | "exitPrice" | "profitLoss" | "roi" | "entryTime" | "exitTime"
> & {
  token: TokenSnapshot;
};

type HoldingLot = {
  amount: number;
  price: number;
};

export type WalletHolding = {
  tokenId: string;
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  chain: string;
  amount: number;
  averageEntryPrice: number;
  notionalCost: number;
};

export type WalletPortfolioSummary = {
  holdings: WalletHolding[];
  realizedProfitLoss: number;
  averageClosedTradeRoi: number | null;
  buyCount: number;
  sellCount: number;
  openPositionCount: number;
  lastActiveAt: Date | null;
};

export class WalletPortfolioService {
  summarize(
    transactions: TransactionWithToken[],
    trades: TradeWithToken[]
  ): WalletPortfolioSummary {
    const lotsByToken = new Map<string, HoldingLot[]>();

    for (const transaction of transactions) {
      const tokenLots = lotsByToken.get(transaction.token.id) ?? [];

      if (transaction.type === "BUY") {
        tokenLots.push({
          amount: transaction.amount,
          price: transaction.price,
        });
        lotsByToken.set(transaction.token.id, tokenLots);
        continue;
      }

      let remainingToSell = transaction.amount;

      while (remainingToSell > 0 && tokenLots.length > 0) {
        const lot = tokenLots[0];
        const matchedAmount = Math.min(remainingToSell, lot.amount);
        lot.amount -= matchedAmount;
        remainingToSell -= matchedAmount;

        if (lot.amount <= 0) {
          tokenLots.shift();
        }
      }

      lotsByToken.set(transaction.token.id, tokenLots);
    }

    const tokenMap = new Map(transactions.map((transaction) => [transaction.token.id, transaction.token]));
    const holdings: WalletHolding[] = [...lotsByToken.entries()]
      .map(([tokenId, lots]) => {
        const token = tokenMap.get(tokenId);

        if (!token || lots.length === 0) {
          return null;
        }

        const amount = lots.reduce((sum, lot) => sum + lot.amount, 0);

        if (amount <= 0) {
          return null;
        }

        const notionalCost = lots.reduce((sum, lot) => sum + lot.amount * lot.price, 0);

        return {
          tokenId,
          tokenSymbol: token.symbol,
          tokenName: token.name,
          tokenAddress: token.address,
          chain: token.chain,
          amount,
          averageEntryPrice: amount > 0 ? notionalCost / amount : 0,
          notionalCost,
        } satisfies WalletHolding;
      })
      .filter((holding): holding is WalletHolding => holding !== null)
      .sort((left, right) => right.notionalCost - left.notionalCost);

    const closedTrades = trades.filter((trade) => trade.roi != null);
    const realizedProfitLoss = closedTrades.reduce(
      (sum, trade) => sum + (trade.profitLoss ?? 0),
      0
    );
    const averageClosedTradeRoi =
      closedTrades.length > 0
        ? closedTrades.reduce((sum, trade) => sum + (trade.roi ?? 0), 0) /
          closedTrades.length
        : null;

    return {
      holdings,
      realizedProfitLoss,
      averageClosedTradeRoi,
      buyCount: transactions.filter((transaction) => transaction.type === "BUY").length,
      sellCount: transactions.filter((transaction) => transaction.type === "SELL").length,
      openPositionCount: holdings.length,
      lastActiveAt: transactions[0]?.timestamp ?? null,
    };
  }
}
