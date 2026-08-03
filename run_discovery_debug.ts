import { walletDiscoveryService } from "./services/WalletDiscoveryService";
import { prisma } from "./lib/prisma";

async function main() {
  console.log("Starting manual discovery run with lower thresholds (1.0 SOL)...");
  try {
    const result = await walletDiscoveryService.runDiscovery(20, 100);
    console.log("Discovery completed successfully!");
    console.log("Result:", JSON.stringify(result, null, 2));

    const wallets = await prisma.wallet.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { score: true }
    });
    console.log("\n=== Latest Wallets in Database ===");
    wallets.forEach(w => {
      console.log(`- Address: ${w.address}, Label: ${w.label}, Score: ${w.score?.totalScore ?? 'None'}, CreatedAt: ${w.createdAt.toISOString()}`);
    });
  } catch (error) {
    console.error("Discovery failed with error:", error);
  }
}

main().finally(() => process.exit(0));
