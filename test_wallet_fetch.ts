import "dotenv/config";
import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);
  const address = "3G6j2KgkWrDM7JoBTrhP4NmkcwACvZnaEeyB4CeeQ7Up";

  console.log("Fetching transactions for wallet...");
  const start = Date.now();
  try {
    const txs = await provider.fetchWalletTransactions(address, 50);
    console.log(`Successfully fetched ${txs.length} txs in ${Date.now() - start}ms.`);
  } catch (err) {
    console.error(`Failed to fetch in ${Date.now() - start}ms:`, err);
  }
}

main().finally(() => process.exit(0));
