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
   * Given a list of transactions (usually fetched for a token mint),
   * extract the unique wallet addresses that performed the trades.
   * By using feePayer, we perfectly filter out all AMM vaults, PDAs, and system programs.
   */
  extractTradersFromTransactions(transactions: HeliusEnhancedTransaction[]): string[] {
    const wallets = new Set<string>();

    for (const tx of transactions) {
      if (!tx.feePayer || !tx.tokenTransfers) continue;

      // Ensure the fee payer is actually the one sending/receiving tokens.
      // This perfectly filters out AMM vaults (they don't pay fees) 
      // AND relayers/gas-bots (they pay fees but don't receive the tokens).
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

