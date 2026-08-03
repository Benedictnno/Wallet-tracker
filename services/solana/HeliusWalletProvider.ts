type HeliusTokenTransfer = {
  mint?: string;
  tokenAmount?: number;
  tokenStandard?: string;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
};

type HeliusNativeTransfer = {
  amount?: number;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
};

type HeliusRawTokenAmount = {
  tokenAmount?: string;
  decimals?: number;
};

type HeliusSwapTokenAmount = {
  userAccount?: string | null;
  tokenAccount?: string | null;
  mint?: string;
  rawTokenAmount?: HeliusRawTokenAmount;
};

type HeliusSwapEvent = {
  nativeInput?: {
    account?: string | null;
    amount?: string;
  } | null;
  nativeOutput?: {
    account?: string | null;
    amount?: string;
  } | null;
  tokenInputs?: HeliusSwapTokenAmount[];
  tokenOutputs?: HeliusSwapTokenAmount[];
  innerSwaps?: Array<{
    programInfo?: {
      source?: string;
      programName?: string;
      instructionName?: string;
    };
  }>;
};

export type CandidateTrader = {
  address: string;
  txHash: string;
  timestamp: number;
  swapValueSol: number;
  swapValueUsd: number;
  tokenAddress: string;
};

export type HeliusEnhancedTransaction = {
  signature?: string;
  description?: string;
  type?: string;
  source?: string;
  timestamp?: number;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  fee?: number;
  feePayer?: string;
  events?: {
    swap?: HeliusSwapEvent;
  };
};

export class HeliusWalletProvider {
  constructor(private readonly apiKey: string) {}

  async fetchWalletTransactions(address: string, limit = 50) {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
    url.searchParams.set("api-key", this.apiKey);
    url.searchParams.set("limit", `${limit}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Helius request failed with status ${response.status}.`);
    }

    return (await response.json()) as HeliusEnhancedTransaction[];
  }

  /**
   * Helper to estimate the swap value in SOL or USD/Stablecoins
   */
  getSwapValue(tx: HeliusEnhancedTransaction): { sol: number; usd: number } {
    let sol = 0;
    let usd = 0;

    if (tx.events?.swap) {
      const swap = tx.events.swap;
      if (swap.nativeInput) {
        sol = Math.max(sol, parseInt(swap.nativeInput.amount || "0") / 1e9);
      }
      if (swap.nativeOutput) {
        sol = Math.max(sol, parseInt(swap.nativeOutput.amount || "0") / 1e9);
      }

      const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
      const tokenInputs = swap.tokenInputs || [];
      const tokenOutputs = swap.tokenOutputs || [];

      for (const input of [...tokenInputs, ...tokenOutputs]) {
        if (input.mint === USDC || input.mint === USDT) {
          const decimals = input.rawTokenAmount?.decimals ?? 6;
          const rawAmount = parseFloat(input.rawTokenAmount?.tokenAmount || "0");
          usd = Math.max(usd, rawAmount / Math.pow(10, decimals));
        }
      }
    }

    // Fallback: search native/token transfers involving the fee payer
    if (sol === 0 && tx.nativeTransfers) {
      for (const nt of tx.nativeTransfers) {
        if ((nt.fromUserAccount === tx.feePayer || nt.toUserAccount === tx.feePayer) && nt.amount) {
          const solValue = nt.amount / 1e9;
          if (solValue > 0.05) {
            sol = Math.max(sol, solValue);
          }
        }
      }
    }

    if (tx.tokenTransfers) {
      const WSOL = "So11111111111111111111111111111111111111112";
      const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
      const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
      for (const tt of tx.tokenTransfers) {
        if ((tt.fromUserAccount === tx.feePayer || tt.toUserAccount === tx.feePayer) && tt.tokenAmount) {
          if (tt.mint === WSOL) {
            sol = Math.max(sol, tt.tokenAmount);
          } else if (tt.mint === USDC || tt.mint === USDT) {
            usd = Math.max(usd, tt.tokenAmount);
          }
        }
      }
    }

    return { sol, usd };
  }

  /**
   * Given a list of transactions (usually fetched for a token mint),
   * extract the unique wallet addresses that performed the trades.
   * By using feePayer, we perfectly filter out all AMM vaults, PDAs, and system programs.
   */
  extractTradersFromTransactions(transactions: HeliusEnhancedTransaction[]): string[] {
    const wallets = new Set<string>();

    for (const tx of transactions) {
      if (!tx.feePayer || !tx.tokenTransfers) continue;

      // Ensure the fee payer is actually the one sending/receiving tokens.
      const isTrader = tx.tokenTransfers.some(
        (t) => t.toUserAccount === tx.feePayer || t.fromUserAccount === tx.feePayer
      );

      if (isTrader) {
        wallets.add(tx.feePayer);
      }
    }

    return Array.from(wallets);
  }

  /**
   * Detailed extraction of candidate traders including trade sizes and timestamps.
   */
  extractTradersFromTransactionsDetailed(
    transactions: HeliusEnhancedTransaction[],
    tokenAddress: string
  ): CandidateTrader[] {
    const candidatesMap = new Map<string, CandidateTrader>();

    for (const tx of transactions) {
      if (!tx.feePayer || !tx.tokenTransfers || !tx.timestamp) continue;

      const isTrader = tx.tokenTransfers.some(
        (t) => t.toUserAccount === tx.feePayer || t.fromUserAccount === tx.feePayer
      );

      if (isTrader) {
        const { sol, usd } = this.getSwapValue(tx);
        const existing = candidatesMap.get(tx.feePayer);
        
        if (existing) {
          // Keep the largest swap value or oldest swap
          existing.swapValueSol = Math.max(existing.swapValueSol, sol);
          existing.swapValueUsd = Math.max(existing.swapValueUsd, usd);
          existing.timestamp = Math.min(existing.timestamp, tx.timestamp);
        } else {
          candidatesMap.set(tx.feePayer, {
            address: tx.feePayer,
            txHash: tx.signature || "",
            timestamp: tx.timestamp,
            swapValueSol: sol,
            swapValueUsd: usd,
            tokenAddress,
          });
        }
      }
    }

    return Array.from(candidatesMap.values());
  }

  /**
   * Fetch all registered webhooks for this API key.
   */
  async getAllWebhooks(): Promise<any[]> {
    if (!this.apiKey) return [];
    try {
      const url = `https://api.helius.xyz/v0/webhooks?api-key=${this.apiKey}`;
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      console.error("[HeliusWalletProvider] Error fetching webhooks:", e);
      return [];
    }
  }

  /**
   * Create a new webhook on Helius.
   */
  async createWebhook(webhookURL: string, accountAddresses: string[]) {
    if (!this.apiKey) throw new Error("HELIUS_API_KEY is not configured.");
    const url = `https://api.helius.xyz/v0/webhooks?api-key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookURL,
        transactionTypes: ["SWAP", "TRANSFER"],
        accountAddresses,
        webhookType: "enhanced",
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Helius webhook: ${response.status} ${errorText}`);
    }
    return await response.json();
  }

  /**
   * Update an existing Helius webhook with a new list of tracked account addresses.
   */
  async updateWebhook(webhookID: string, webhookURL: string, accountAddresses: string[]) {
    if (!this.apiKey) throw new Error("HELIUS_API_KEY is not configured.");
    const url = `https://api.helius.xyz/v0/webhooks/${webhookID}?api-key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookURL,
        transactionTypes: ["SWAP", "TRANSFER"],
        accountAddresses,
        webhookType: "enhanced",
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update Helius webhook: ${response.status} ${errorText}`);
    }
    return await response.json();
  }

  /**
   * Synchronize active copy-trading wallet addresses with Helius Webhook.
   * If a webhook already exists, update its accountAddresses. Otherwise create one.
   */
  async syncTrackedWallets(webhookURL: string, addressesToTrack: string[]) {
    if (!this.apiKey) {
      return { success: false, reason: "HELIUS_API_KEY missing" };
    }

    const webhooks = await this.getAllWebhooks();
    // Find matching webhook by URL path ending in /api/webhooks/helius or exact URL match
    const existingWebhook = webhooks.find(
      (w) => w.webhookURL === webhookURL || w.webhookURL.endsWith("/api/webhooks/helius")
    );

    if (existingWebhook) {
      console.log(`[HeliusSync] Updating webhook ${existingWebhook.webhookID} with ${addressesToTrack.length} addresses.`);
      const updated = await this.updateWebhook(existingWebhook.webhookID, webhookURL, addressesToTrack);
      return { success: true, action: "updated", webhook: updated };
    } else {
      console.log(`[HeliusSync] Creating new webhook for ${webhookURL} with ${addressesToTrack.length} addresses.`);
      const created = await this.createWebhook(webhookURL, addressesToTrack);
      return { success: true, action: "created", webhook: created };
    }
  }
}

