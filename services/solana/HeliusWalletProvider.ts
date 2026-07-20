type HeliusTokenTransfer = {
  mint?: string;
  tokenAmount?: number;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
};

type HeliusNativeTransfer = {
  amount?: number;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
};

export type HeliusEnhancedTransaction = {
  signature?: string;
  timestamp?: number;
  tokenTransfers?: HeliusTokenTransfer[];
  nativeTransfers?: HeliusNativeTransfer[];
  fee?: number;
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
}
