import type { HeliusEnhancedTransaction } from "@/services/solana/HeliusWalletProvider";

export type ParsedWalletTransaction = {
  externalId: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  type: "BUY" | "SELL";
  amount: number;
  price: number;
  timestamp: Date;
};

export class TransactionParserService {
  parseSolanaWalletTransactions(
    walletAddress: string,
    transactions: HeliusEnhancedTransaction[]
  ): ParsedWalletTransaction[] {
    return transactions.flatMap((transaction) =>
      this.parseSingleTransaction(walletAddress, transaction)
    );
  }

  private parseSingleTransaction(
    walletAddress: string,
    transaction: HeliusEnhancedTransaction
  ) {
    const tokenTransfers = transaction.tokenTransfers ?? [];
    const nativeTransfers = transaction.nativeTransfers ?? [];
    const nativeDeltaInSol = nativeTransfers.reduce((sum, transfer) => {
      if (transfer.toUserAccount === walletAddress) {
        return sum + (transfer.amount ?? 0) / 1_000_000_000;
      }

      if (transfer.fromUserAccount === walletAddress) {
        return sum - (transfer.amount ?? 0) / 1_000_000_000;
      }

      return sum;
    }, 0);

    const timestamp = new Date((transaction.timestamp ?? 0) * 1000);

    return tokenTransfers.flatMap((transfer, index) => {
      const mint = transfer.mint;
      const amount = transfer.tokenAmount ?? 0;

      if (!mint || amount <= 0) {
        return [];
      }

      const isIncoming = transfer.toUserAccount === walletAddress;
      const isOutgoing = transfer.fromUserAccount === walletAddress;

      if (!isIncoming && !isOutgoing) {
        return [];
      }

      const type = isIncoming ? "BUY" : "SELL";
      const estimatedPrice = amount > 0 ? Math.abs(nativeDeltaInSol) / amount : 0;
      const shortMint = `${mint.slice(0, 4)}...${mint.slice(-4)}`;

      return [
        {
          externalId: `${transaction.signature ?? "unknown"}:${mint}:${index}:${type}`,
          tokenAddress: mint,
          tokenSymbol: shortMint,
          tokenName: shortMint,
          chain: "Solana",
          type,
          amount,
          price: estimatedPrice,
          timestamp,
        } satisfies ParsedWalletTransaction,
      ];
    });
  }
}
