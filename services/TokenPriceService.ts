import { prisma } from "@/lib/prisma";

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  priceUsd?: string;
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    socials?: Array<{ type?: string; url?: string }>;
  };
};

type DexScreenerResponse = {
  pairs?: DexScreenerPair[];
};

type JupiterPriceResponse = {
  data?: Record<
    string,
    {
      id?: string;
      type?: string;
      price?: string;
    }
  >;
};

export type TokenEnrichmentResult = {
  priceUsd: number | null;
  marketCap: number | null;
  liquidity: number | null;
  fdv: number | null;
  launchDate: Date | null;
  symbol: string | null;
  name: string | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEXSCREENER_DELAY_MS = 250; // ~240 requests/min, well under 300/min limit
const NATIVE_SOL_ADDRESS = "So11111111111111111111111111111111111111112";

export class TokenPriceService {
  /**
   * Enrich a single token with DexScreener data.
   * Falls back to Jupiter for price-only if DexScreener returns nothing.
   */
  async enrichToken(tokenAddress: string): Promise<TokenEnrichmentResult> {
    if (tokenAddress === "SOL" || tokenAddress === NATIVE_SOL_ADDRESS) {
      return this.enrichSOL();
    }

    const dexResult = await this.fetchFromDexScreener(tokenAddress);

    if (dexResult) {
      return dexResult;
    }

    // Fallback: Jupiter price API (price only, no market cap / liquidity)
    const jupiterPrice = await this.fetchFromJupiter(tokenAddress);

    return {
      priceUsd: jupiterPrice,
      marketCap: null,
      liquidity: null,
      fdv: null,
      launchDate: null,
      symbol: null,
      name: null,
    };
  }

  /**
   * Enrich all tokens in the database that haven't been updated recently.
   * Respects rate limits by spacing requests.
   */
  async enrichAllStaleTokens(): Promise<{ enriched: number; skipped: number }> {
    const staleThreshold = new Date(Date.now() - CACHE_TTL_MS);

    const staleTokens = await prisma.token.findMany({
      where: {
        chain: "Solana",
        OR: [
          { metadataUpdatedAt: null },
          { metadataUpdatedAt: { lt: staleThreshold } },
        ],
      },
    });

    let enriched = 0;
    let skipped = 0;

    for (const token of staleTokens) {
      if (token.address === "SOL" || token.address === NATIVE_SOL_ADDRESS) {
        skipped++;
        continue;
      }

      const result = await this.enrichToken(token.address);

      await prisma.token.update({
        where: { id: token.id },
        data: {
          priceUsd: result.priceUsd,
          marketCap: result.marketCap,
          liquidity: result.liquidity,
          fdv: result.fdv,
          launchDate: result.launchDate,
          symbol: result.symbol && !token.symbol.includes("...")
            ? token.symbol
            : result.symbol ?? token.symbol,
          name: result.name && !token.name.includes("...")
            ? token.name
            : result.name ?? token.name,
          metadataUpdatedAt: new Date(),
        },
      });

      enriched++;

      // Rate limit spacing
      await this.delay(DEXSCREENER_DELAY_MS);
    }

    return { enriched, skipped };
  }

  /**
   * Enrich a specific list of token addresses. Returns a map of address → result.
   */
  async enrichTokenBatch(
    tokenAddresses: string[]
  ): Promise<Map<string, TokenEnrichmentResult>> {
    const results = new Map<string, TokenEnrichmentResult>();
    const unique = [...new Set(tokenAddresses)].slice(0, 5);

    await Promise.all(
      unique.map(async (address) => {
        try {
          const result = await Promise.race([
            this.enrichToken(address),
            new Promise<TokenEnrichmentResult>((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    priceUsd: null,
                    marketCap: null,
                    liquidity: null,
                    fdv: null,
                    launchDate: null,
                    symbol: null,
                    name: null,
                  }),
                1500
              )
            ),
          ]);
          results.set(address, result);
        } catch {
          // ignore error
        }
      })
    );

    return results;
  }

  private async fetchFromDexScreener(
    tokenAddress: string
  ): Promise<TokenEnrichmentResult | null> {
    try {
      const url = `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as DexScreenerPair[] | DexScreenerResponse;

      // DexScreener v1 returns an array directly
      const pairs = Array.isArray(data) ? data : data.pairs ?? [];

      if (pairs.length === 0) {
        return null;
      }

      // Pick the pair with the highest liquidity
      const bestPair = pairs.reduce((best, pair) =>
        (pair.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? pair : best
      );

      return {
        priceUsd: bestPair.priceUsd ? parseFloat(bestPair.priceUsd) : null,
        marketCap: bestPair.marketCap ?? null,
        liquidity: bestPair.liquidity?.usd ?? null,
        fdv: bestPair.fdv ?? null,
        launchDate: bestPair.pairCreatedAt
          ? new Date(bestPair.pairCreatedAt)
          : null,
        symbol: bestPair.baseToken?.symbol ?? null,
        name: bestPair.baseToken?.name ?? null,
      };
    } catch {
      return null;
    }
  }

  private async fetchFromJupiter(tokenAddress: string): Promise<number | null> {
    try {
      const url = `https://api.jup.ag/price/v2?ids=${tokenAddress}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as JupiterPriceResponse;
      const entry = data.data?.[tokenAddress];

      if (!entry?.price) {
        return null;
      }

      return parseFloat(entry.price);
    } catch {
      return null;
    }
  }

  private async enrichSOL(): Promise<TokenEnrichmentResult> {
    const price = await this.fetchFromJupiter(NATIVE_SOL_ADDRESS);

    return {
      priceUsd: price,
      marketCap: null,
      liquidity: null,
      fdv: null,
      launchDate: null,
      symbol: "SOL",
      name: "Solana",
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const tokenPriceService = new TokenPriceService();
