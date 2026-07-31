/**
 * SolPriceService
 * Fetches the live SOL/USD price from Jupiter price API.
 * Results are cached in-memory for 60 seconds to avoid hammering the API
 * on every trade rebuild or unrealized PnL calculation.
 *
 * Fallback: $150 USD (used only if the request fails entirely).
 */

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
const CACHE_TTL_MS = 60_000; // 60 seconds
const FALLBACK_PRICE_USD = 150;

type JupiterPriceResponse = {
  data?: Record<string, { id?: string; price?: string }>;
};

class SolPriceService {
  private cachedPrice: number | null = null;
  private cacheExpiry: number = 0;

  /**
   * Returns the current SOL/USD price.
   * Uses cached value if fresh, otherwise fetches from Jupiter.
   */
  async getSOLPriceUsd(): Promise<number> {
    const now = Date.now();

    if (this.cachedPrice !== null && now < this.cacheExpiry) {
      return this.cachedPrice;
    }

    try {
      const url = `https://lite.jupiterapi.com/price?ids=${NATIVE_SOL_MINT}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`Jupiter price API returned ${response.status}`);
      }

      const json: JupiterPriceResponse = await response.json();
      const priceStr = json.data?.[NATIVE_SOL_MINT]?.price;
      const price = priceStr ? parseFloat(priceStr) : null;

      if (!price || isNaN(price) || price <= 0) {
        throw new Error("Invalid price in response");
      }

      this.cachedPrice = price;
      this.cacheExpiry = now + CACHE_TTL_MS;
      return price;
    } catch (err) {
      console.warn(
        `[SolPriceService] Failed to fetch SOL price, using fallback ($${FALLBACK_PRICE_USD}):`,
        err
      );
      return FALLBACK_PRICE_USD;
    }
  }

  /** Clears the in-memory cache — useful for tests. */
  clearCache() {
    this.cachedPrice = null;
    this.cacheExpiry = 0;
  }
}

export const solPriceService = new SolPriceService();
