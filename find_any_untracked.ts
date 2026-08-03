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

  const candidatesMap = new Map<string, { address: string; score: number }>();

  for (const tokenAddress of tokens) {
    try {
      const txs = await provider.fetchWalletTransactions(tokenAddress, 100);
      const traders = provider.extractTradersFromTransactions(txs);
      for (const address of traders) {
        if (address.length < 30) continue;
        const existing = candidatesMap.get(address);
        if (existing) {
          existing.score += 1;
        } else {
          candidatesMap.set(address, { address, score: 1 });
        }
      }
    } catch (e) {
      // ignore
    }
  }

  console.log(`Total unique traders found: ${candidatesMap.size}`);
  
  const untracked = [];
  for (const [address, info] of candidatesMap) {
    const existing = await prisma.wallet.findFirst({ where: { address, chain: "Solana" } });
    if (!existing) {
      untracked.push(info);
    }
  }

  console.log(`Untracked unique traders: ${untracked.length}`);
  
  // Sort by score (frequency of appearing in trending tokens)
  untracked.sort((a, b) => b.score - a.score);

  console.log("\nTop 5 most active untracked traders across trending tokens:");
  for (const item of untracked.slice(0, 5)) {
    console.log(`Address: ${item.address}, Frequency Score: ${item.score}`);
  }

  // Let's add the top 3 untracked traders to the database!
  const targetToIngest = untracked.slice(0, 3);
  console.log(`\nIngesting top ${targetToIngest.length} untracked wallets...`);
  
  for (const item of targetToIngest) {
    const wallet = await prisma.wallet.create({
      data: {
        address: item.address,
        chain: "Solana",
        label: `Discovered Wallet (${item.address.slice(0, 4)}...${item.address.slice(-4)})`,
        copyTradeSettings: {
          create: {
            enabled: true, // Auto-enable copy trading for them!
            defaultTradeSize: 0.1,
            slippageBps: 300,
            takeProfitPct: 2.0,
            stopLossPct: 0.5,
            maxDailyLoss: 0.5
          }
        }
      }
    });
    console.log(`Ingested: ${wallet.address} (ID: ${wallet.id})`);
  }
}

main().finally(() => process.exit(0));
