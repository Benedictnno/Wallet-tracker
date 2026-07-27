import type { TokenEnrichmentResult } from "@/services/TokenPriceService";

export type SpamFilterResult = {
  isSpam: boolean;
  spamReason: string | null;
};

// Common scam/spam patterns on Solana
const SPAM_URL_PATTERN = /(https?:\/\/[^\s]+|\.com|\.io|\.org|\.net)/i;
const SPAM_NAME_KEYWORDS = ["airdrop", "claim", "free", "visit", "bonus", "reward"];

const MIN_LIQUIDITY_USD = 1000;

export class SpamTokenFilter {
  /**
   * Determine if a token is likely spam/scam based on its enrichment data and metadata.
   */
  analyzeToken(
    symbol: string,
    name: string,
    enrichment: TokenEnrichmentResult,
    wasAirdropped = false
  ): SpamFilterResult {
    // 1. Check for URLs or spam keywords in the token name or symbol
    if (SPAM_URL_PATTERN.test(name) || SPAM_URL_PATTERN.test(symbol)) {
      return { isSpam: true, spamReason: "url_in_name" };
    }

    const nameLower = name.toLowerCase();
    if (SPAM_NAME_KEYWORDS.some((kw) => nameLower.includes(kw))) {
      return { isSpam: true, spamReason: "spam_keywords" };
    }

    // 2. Liquidity Check
    // If we have DexScreener data, check liquidity
    if (enrichment.liquidity !== null) {
      if (enrichment.liquidity < MIN_LIQUIDITY_USD) {
        return { isSpam: true, spamReason: "low_liquidity" };
      }
    } else {
       // No DexScreener data (might just be Jupiter, or completely unknown)
       // If it was airdropped and we can't find it on DexScreener, highly likely spam
       if (wasAirdropped) {
         return { isSpam: true, spamReason: "airdrop_unknown_token" };
       }
    }

    // 3. Airdrop heuristics
    // If the token was airdropped (received without a corresponding swap/buy from the user)
    // and it doesn't have a very high market cap/liquidity, treat it suspiciously.
    // (We'll assume legitimate airdrops like JTO or PYTH will quickly get liquidity).
    if (wasAirdropped && (enrichment.liquidity ?? 0) < 10000) {
        return { isSpam: true, spamReason: "low_liquidity_airdrop" };
    }

    return { isSpam: false, spamReason: null };
  }
}

export const spamTokenFilter = new SpamTokenFilter();
