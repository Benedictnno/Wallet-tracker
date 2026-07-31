import { prisma } from "@/lib/prisma";
import { HeliusWalletProvider } from "@/services/solana/HeliusWalletProvider";
import { walletTrackerService } from "@/services/WalletTrackerService";
import { walletIngestionService } from "@/services/WalletIngestionService";

type DexScreenerToken = {
  baseToken: {
    address: string;
    symbol: string;
  };
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  chainId?: string;
};

const EXCLUDED_MINTS = new Set([
  "So11111111111111111111111111111111111111112", // WSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "11111111111111111111111111111111", // System Program
]);

export class WalletDiscoveryService {

  /**
   * Fetches active Solana tokens from DexScreener.
   * Filters out native SOL, stablecoins, and system tokens.
   */
  async fetchTrendingTokens(limit = 5): Promise<string[]> {
    try {
      const response = await fetch("https://api.dexscreener.com/latest/dex/search?q=solana", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) return [];

      const data = await response.json();
      const pairs = (data.pairs ?? []) as DexScreenerToken[];

      // Filter for Solana pairs with liquidity > $10k and volume > $20k
      const validPairs = pairs
        .filter((p) => 
          p.chainId === "solana" && 
          (p.liquidity?.usd ?? 0) > 10000 &&
          !EXCLUDED_MINTS.has(p.baseToken.address)
        )
        .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0));

      const addresses = validPairs.map((p) => p.baseToken.address);
      return [...new Set(addresses)].slice(0, limit);
    } catch (error) {
      console.error("[WalletDiscoveryService] Failed to fetch trending tokens:", error);
      return [];
    }
  }

  /**
   * Main pipeline to discover new wallets.
   * 1. Fetches trending tokens.
   * 2. Finds traders of those tokens via Helius (up to 100 txs per token).
   * 3. Filters traders by swap size (> 2 SOL or > $300).
   * 4. Flags early buyers and calculates multi-token overlap.
   * 5. Ranks candidates and ingests the top 3.
   */
  async runDiscovery(tokenLimit = 3, limitWalletsPerToken = 100): Promise<{ discovered: number; processed: number }> {
    const tokens = await this.fetchTrendingTokens(tokenLimit);
    
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      console.error("[WalletDiscoveryService] HELIUS_API_KEY is not set.");
      return { discovered: 0, processed: 0 };
    }
    const heliusProvider = new HeliusWalletProvider(apiKey);

    // Candidates across all trending tokens: address -> candidate info
    // For overlap tracking and sorting
    const candidatePool = new Map<string, {
      address: string;
      tradedTokens: Set<string>;
      isEarlyBuyer: boolean;
      maxSwapSol: number;
      maxSwapUsd: number;
    }>();

    const MIN_SOL_THRESHOLD = 2.0;
    const MIN_USD_THRESHOLD = 300.0;

    for (const tokenAddress of tokens) {
      try {
        // Fetch up to 100 transactions to catch a broader timeframe
        const txs = await heliusProvider.fetchWalletTransactions(tokenAddress, 100);
        if (txs.length === 0) continue;

        // Sort chronologically ascending to identify early transactions in this batch
        const sortedTxs = [...txs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        // Define early threshold (first 20% of transactions chronologically)
        const earlyCutoffIndex = Math.max(1, Math.floor(sortedTxs.length * 0.2));
        const earlyTxs = new Set(sortedTxs.slice(0, earlyCutoffIndex).map(t => t.signature));

        const tradersDetailed = heliusProvider.extractTradersFromTransactionsDetailed(txs, tokenAddress);

        for (const t of tradersDetailed) {
          // Exclude program/stablecoin mints and small strings
          if (EXCLUDED_MINTS.has(t.address) || t.address.length < 30) continue;

          // Trade Size Thresholding
          if (t.swapValueSol < MIN_SOL_THRESHOLD && t.swapValueUsd < MIN_USD_THRESHOLD) {
            continue; // Filter out small/retail trades
          }

          const isEarly = earlyTxs.has(t.txHash);
          const existing = candidatePool.get(t.address);

          if (existing) {
            existing.tradedTokens.add(tokenAddress);
            if (isEarly) existing.isEarlyBuyer = true;
            existing.maxSwapSol = Math.max(existing.maxSwapSol, t.swapValueSol);
            existing.maxSwapUsd = Math.max(existing.maxSwapUsd, t.swapValueUsd);
          } else {
            candidatePool.set(t.address, {
              address: t.address,
              tradedTokens: new Set([tokenAddress]),
              isEarlyBuyer: isEarly,
              maxSwapSol: t.swapValueSol,
              maxSwapUsd: t.swapValueUsd,
            });
          }
        }
      } catch (error) {
        console.error(`[WalletDiscoveryService] Failed to fetch traders for token ${tokenAddress}:`, error);
      }
    }

    // Filter out candidates we are already tracking
    const candidates = Array.from(candidatePool.values());
    const validCandidates: typeof candidates = [];

    for (const c of candidates) {
      const existing = await prisma.wallet.findFirst({ where: { address: c.address, chain: "Solana" } });
      if (!existing) {
        validCandidates.push(c);
      }
    }

    // Rank candidates:
    // 1. Multi-token overlap (tradedTokens size desc)
    // 2. Early buyer first
    // 3. Max swap size (SOL desc, then USD desc)
    validCandidates.sort((a, b) => {
      if (b.tradedTokens.size !== a.tradedTokens.size) {
        return b.tradedTokens.size - a.tradedTokens.size;
      }
      if (a.isEarlyBuyer !== b.isEarlyBuyer) {
        return a.isEarlyBuyer ? -1 : 1;
      }
      if (b.maxSwapSol !== a.maxSwapSol) {
        return b.maxSwapSol - a.maxSwapSol;
      }
      return b.maxSwapUsd - a.maxSwapUsd;
    });

    // Select top 3 candidates for ingestion
    const targetCandidates = validCandidates.slice(0, 3);
    let newlyAdded = 0;
    const walletIdsToProcess: string[] = [];

    for (const c of targetCandidates) {
      console.log(`[WalletDiscoveryService] Ingesting high-value candidate: ${c.address} (Tokens: ${c.tradedTokens.size}, Early: ${c.isEarlyBuyer}, MaxSwap: ${c.maxSwapSol} SOL / $${c.maxSwapUsd})`);
      const wallet = await prisma.wallet.create({
        data: {
          address: c.address,
          chain: "Solana",
          label: `Discovered Wallet (${c.address.slice(0, 4)}...${c.address.slice(-4)})`,
        },
      });
      newlyAdded++;
      walletIdsToProcess.push(wallet.id);
    }

    // Sync on-chain activity & calculate scores
    let processed = 0;
    for (const walletId of walletIdsToProcess) {
      try {
        await walletIngestionService.syncWalletActivity(walletId);
        await walletTrackerService.refreshWalletAnalysis(walletId);
        processed++;
      } catch (error) {
        console.error(`[WalletDiscoveryService] Failed to process wallet ${walletId}:`, error);
      }
    }

    return { discovered: newlyAdded, processed };
  }

  /**
   * Deletes wallets that scored poorly (< 15) to keep database clean.
   */
  async pruneLowScoringWallets(minScore = 15): Promise<number> {
    try {
      const { count } = await prisma.wallet.deleteMany({
        where: {
          score: {
            totalScore: {
              lt: minScore,
            },
          },
          // Do not delete wallets that have copy trading settings enabled
          copyTradeSettings: null,
        },
      });

      // Also prune wallets with no trades created > 24 hours ago
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const emptyWallets = await prisma.wallet.deleteMany({
        where: {
          score: null,
          createdAt: { lt: oneDayAgo },
          copyTradeSettings: null,
        },
      });

      return count + emptyWallets.count;
    } catch (e) {
      console.error("[WalletDiscoveryService] Prune error:", e);
      return 0;
    }
  }
}

export const walletDiscoveryService = new WalletDiscoveryService();

