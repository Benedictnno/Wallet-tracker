import "dotenv/config";
import { prisma } from "./lib/prisma";
import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";
import { WalletDiscoveryService } from "./services/WalletDiscoveryService";

async function main() {
  const service = new WalletDiscoveryService();
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);

  console.log("Fetching trending tokens...");
  const tokens = await service.fetchTrendingTokens(20);
  console.log(`Found ${tokens.length} trending tokens.`);

  const candidatesMap = new Map<string, any>();
  const MIN_SOL = 1.0;
  const MIN_USD = 150.0;

  for (const tokenAddress of tokens) {
    try {
      const txs = await provider.fetchWalletTransactions(tokenAddress, 100);
      const traders = provider.extractTradersFromTransactionsDetailed(txs, tokenAddress);
      for (const t of traders) {
        if (t.swapValueSol >= MIN_SOL || t.swapValueUsd >= MIN_USD) {
          candidatesMap.set(t.address, t);
        }
      }
    } catch (e) {
      // ignore token error
    }
  }

  console.log(`Total unique traders with >= ${MIN_SOL} SOL or >= $${MIN_USD} USD swap: ${candidatesMap.size}`);
  
  const untracked = [];
  for (const [address, info] of candidatesMap) {
    const existing = await prisma.wallet.findFirst({ where: { address, chain: "Solana" } });
    if (!existing) {
      untracked.push(info);
    }
  }

  console.log(`Untracked traders with >= ${MIN_SOL} SOL swap: ${untracked.length}`);
  if (untracked.length > 0) {
    console.log("Sample untracked traders:");
    console.log(untracked.slice(0, 5));
  }
}

main().finally(() => process.exit(0));
