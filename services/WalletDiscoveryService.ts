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
   * 2. Finds recent traders of those tokens via Helius.
   * 3. Ingests and scores the top new wallets.
   */
  async runDiscovery(tokenLimit = 3, limitWalletsPerToken = 3): Promise<{ discovered: number; processed: number }> {
    const tokens = await this.fetchTrendingTokens(tokenLimit);
    const discoveredWallets = new Set<string>();

    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      console.error("[WalletDiscoveryService] HELIUS_API_KEY is not set.");
      return { discovered: 0, processed: 0 };
    }
    const heliusProvider = new HeliusWalletProvider(apiKey);

    for (const tokenAddress of tokens) {
      try {
        const txs = await heliusProvider.fetchWalletTransactions(tokenAddress, 30);
        const traders = heliusProvider.extractTradersFromTransactions(txs);
        
        // Take a small sample of active traders
        traders
          .filter(w => !EXCLUDED_MINTS.has(w) && w.length > 30)
          .slice(0, limitWalletsPerToken)
          .forEach(w => discoveredWallets.add(w));
      } catch (error) {
        console.error(`[WalletDiscoveryService] Failed to fetch traders for token ${tokenAddress}:`, error);
      }
    }

    let newlyAdded = 0;
    const walletIdsToProcess: string[] = [];

    // Limit to max 2 wallets per discovery run for ultra-fast response
    const targetWallets = Array.from(discoveredWallets).slice(0, 2);

    for (const address of targetWallets) {
      let wallet = await prisma.wallet.findFirst({ where: { address, chain: "Solana" } });
      
      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            address,
            chain: "Solana",
            label: `Discovered Wallet (${address.slice(0, 4)}...${address.slice(-4)})`,
          },
        });
        newlyAdded++;
      }
      
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

