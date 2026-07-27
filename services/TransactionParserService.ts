import type { HeliusEnhancedTransaction } from "@/services/solana/HeliusWalletProvider";

export type ParsedWalletTransaction = {
  externalId: string;
  signature?: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  type: "BUY" | "SELL";
  transactionType?: string;
  source?: string;
  description?: string;
  amount: number;
  price: number;
  counterAssetAddress?: string;
  counterAssetSymbol?: string;
  counterAmount?: number;
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
    const swapEntries = this.parseSwapTransaction(walletAddress, transaction);

    if (swapEntries.length > 0) {
      return swapEntries;
    }

    const pumpFunEntries = this.parsePumpFunTransaction(walletAddress, transaction);
    if (pumpFunEntries.length > 0) {
      return pumpFunEntries;
    }

    const raydiumEntries = this.parseRaydiumTransaction(walletAddress, transaction);
    if (raydiumEntries.length > 0) {
      return raydiumEntries;
    }

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
          signature: transaction.signature,
          tokenAddress: mint,
          tokenSymbol: shortMint,
          tokenName: shortMint,
          chain: "Solana",
          type,
          transactionType: transaction.type,
          source: transaction.source,
          description: transaction.description,
          amount,
          price: estimatedPrice,
          counterAssetAddress: nativeDeltaInSol !== 0 ? "SOL" : undefined,
          counterAssetSymbol: nativeDeltaInSol !== 0 ? "SOL" : undefined,
          counterAmount: nativeDeltaInSol !== 0 ? Math.abs(nativeDeltaInSol) : undefined,
          timestamp,
        } satisfies ParsedWalletTransaction,
      ];
    });
  }

  private parseSwapTransaction(
    walletAddress: string,
    transaction: HeliusEnhancedTransaction
  ): ParsedWalletTransaction[] {
    const swap = transaction.events?.swap;

    if (!swap) {
      return [];
    }

    const timestamp = new Date((transaction.timestamp ?? 0) * 1000);
    const outputsToWallet = (swap.tokenOutputs ?? []).filter(
      (token) => token.userAccount === walletAddress
    );
    const inputsFromWallet = (swap.tokenInputs ?? []).filter(
      (token) => token.userAccount === walletAddress
    );

    const buyCounterAsset = this.resolveCounterAsset({
      nativeAmount: this.parseNativeAmount(swap.nativeInput?.amount),
      tokenLegs: inputsFromWallet,
    });
    const sellCounterAsset = this.resolveCounterAsset({
      nativeAmount: this.parseNativeAmount(swap.nativeOutput?.amount),
      tokenLegs: outputsToWallet,
    });

    const buys = outputsToWallet.flatMap((token, index) => {
      const mint = token.mint;
      const amount = this.parseRawTokenAmount(token.rawTokenAmount);

      if (!mint || amount <= 0) {
        return [];
      }

      return [
        {
          externalId: `${transaction.signature ?? "unknown"}:${mint}:${index}:BUY`,
          signature: transaction.signature,
          tokenAddress: mint,
          tokenSymbol: this.formatMintLabel(mint),
          tokenName: this.formatMintLabel(mint),
          chain: "Solana",
          type: "BUY",
          transactionType: transaction.type,
          source: transaction.source,
          description: transaction.description,
          amount,
          price: this.calculateUnitPrice(buyCounterAsset.amount, amount),
          counterAssetAddress: buyCounterAsset.address,
          counterAssetSymbol: buyCounterAsset.symbol,
          counterAmount: buyCounterAsset.amount,
          timestamp,
        } satisfies ParsedWalletTransaction,
      ];
    });

    const sells = inputsFromWallet.flatMap((token, index) => {
      const mint = token.mint;
      const amount = this.parseRawTokenAmount(token.rawTokenAmount);

      if (!mint || amount <= 0) {
        return [];
      }

      return [
        {
          externalId: `${transaction.signature ?? "unknown"}:${mint}:${index}:SELL`,
          signature: transaction.signature,
          tokenAddress: mint,
          tokenSymbol: this.formatMintLabel(mint),
          tokenName: this.formatMintLabel(mint),
          chain: "Solana",
          type: "SELL",
          transactionType: transaction.type,
          source: transaction.source,
          description: transaction.description,
          amount,
          price: this.calculateUnitPrice(sellCounterAsset.amount, amount),
          counterAssetAddress: sellCounterAsset.address,
          counterAssetSymbol: sellCounterAsset.symbol,
          counterAmount: sellCounterAsset.amount,
          timestamp,
        } satisfies ParsedWalletTransaction,
      ];
    });

    return [...buys, ...sells];
  }

  private parsePumpFunTransaction(
    walletAddress: string,
    transaction: HeliusEnhancedTransaction
  ): ParsedWalletTransaction[] {
    const isPumpFun = transaction.source === "PUMP_FUN" || transaction.description?.toLowerCase().includes("pump.fun");
    if (!isPumpFun) return [];

    return this.parseAMMTransaction(walletAddress, transaction);
  }

  private parseRaydiumTransaction(
    walletAddress: string,
    transaction: HeliusEnhancedTransaction
  ): ParsedWalletTransaction[] {
    if (transaction.source !== "RAYDIUM") return [];
    
    return this.parseAMMTransaction(walletAddress, transaction);
  }

  private parseAMMTransaction(
    walletAddress: string,
    transaction: HeliusEnhancedTransaction
  ): ParsedWalletTransaction[] {
    // Both Pump.fun and Raydium often lack the top-level swap event in Helius if it's a direct AMM interaction
    // We can reconstruct it from tokenTransfers and nativeTransfers
    const tokenTransfers = transaction.tokenTransfers ?? [];
    const nativeTransfers = transaction.nativeTransfers ?? [];

    const incomingTokens = tokenTransfers.filter(t => t.toUserAccount === walletAddress);
    const outgoingTokens = tokenTransfers.filter(t => t.fromUserAccount === walletAddress);
    
    const incomingSol = nativeTransfers.filter(t => t.toUserAccount === walletAddress).reduce((sum, t) => sum + (t.amount ?? 0), 0) / 1_000_000_000;
    const outgoingSol = nativeTransfers.filter(t => t.fromUserAccount === walletAddress).reduce((sum, t) => sum + (t.amount ?? 0), 0) / 1_000_000_000;
    
    const timestamp = new Date((transaction.timestamp ?? 0) * 1000);
    const results: ParsedWalletTransaction[] = [];

    // Buy: SOL out, Token in
    incomingTokens.forEach((transfer, index) => {
        const mint = transfer.mint;
        const amount = transfer.tokenAmount ?? 0;
        if (!mint || amount <= 0) return;

        results.push({
          externalId: `${transaction.signature ?? "unknown"}:${mint}:${index}:BUY`,
          signature: transaction.signature,
          tokenAddress: mint,
          tokenSymbol: this.formatMintLabel(mint),
          tokenName: this.formatMintLabel(mint),
          chain: "Solana",
          type: "BUY",
          transactionType: transaction.type,
          source: transaction.source,
          description: transaction.description,
          amount,
          price: this.calculateUnitPrice(outgoingSol, amount),
          counterAssetAddress: outgoingSol > 0 ? "SOL" : undefined,
          counterAssetSymbol: outgoingSol > 0 ? "SOL" : undefined,
          counterAmount: outgoingSol > 0 ? outgoingSol : undefined,
          timestamp,
        });
    });

    // Sell: Token out, SOL in
    outgoingTokens.forEach((transfer, index) => {
        const mint = transfer.mint;
        const amount = transfer.tokenAmount ?? 0;
        if (!mint || amount <= 0) return;

        results.push({
          externalId: `${transaction.signature ?? "unknown"}:${mint}:${index}:SELL`,
          signature: transaction.signature,
          tokenAddress: mint,
          tokenSymbol: this.formatMintLabel(mint),
          tokenName: this.formatMintLabel(mint),
          chain: "Solana",
          type: "SELL",
          transactionType: transaction.type,
          source: transaction.source,
          description: transaction.description,
          amount,
          price: this.calculateUnitPrice(incomingSol, amount),
          counterAssetAddress: incomingSol > 0 ? "SOL" : undefined,
          counterAssetSymbol: incomingSol > 0 ? "SOL" : undefined,
          counterAmount: incomingSol > 0 ? incomingSol : undefined,
          timestamp,
        });
    });

    return results;
  }

  private resolveCounterAsset({
    nativeAmount,
    tokenLegs,
  }: {
    nativeAmount: number;
    tokenLegs: Array<{
      mint?: string;
      rawTokenAmount?: {
        tokenAmount?: string;
        decimals?: number;
      };
    }>;
  }) {
    if (nativeAmount > 0) {
      return {
        address: "SOL",
        symbol: "SOL",
        amount: nativeAmount,
      };
    }

    const tokenLeg = tokenLegs[0];

    if (!tokenLeg?.mint) {
      return {
        address: undefined,
        symbol: undefined,
        amount: undefined,
      };
    }

    return {
      address: tokenLeg.mint,
      symbol: this.formatMintLabel(tokenLeg.mint),
      amount: this.parseRawTokenAmount(tokenLeg.rawTokenAmount),
    };
  }

  private parseNativeAmount(amount?: string | null) {
    const lamports = Number(amount ?? 0);
    return Number.isFinite(lamports) ? lamports / 1_000_000_000 : 0;
  }

  private parseRawTokenAmount(raw?: { tokenAmount?: string; decimals?: number }) {
    const tokenAmount = Number(raw?.tokenAmount ?? 0);
    const decimals = raw?.decimals ?? 0;

    if (!Number.isFinite(tokenAmount)) {
      return 0;
    }

    return tokenAmount / 10 ** decimals;
  }

  private calculateUnitPrice(counterAmount: number | undefined, amount: number) {
    if (!counterAmount || amount <= 0) {
      return 0;
    }

    return counterAmount / amount;
  }

  private formatMintLabel(mint: string) {
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
  }
}
