import "dotenv/config";
import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);
  
  const wallets = [
    "44Vu4e84J9sjNY4VVfFVRfjtXRSB8GCeP81LYd3BkZGD",
    "GGek6MJqkLeFBjaNnF3o4pWuhu2twfxjpZ3b2qf4DgLN",
    "5M8c9fdZu4fz3CiGRpT8L5UP53cwn83iEDNjpMHorPbz",
    "4A1snSJmJyibf69mHVpzUBzeLTMrdzd88QgdQyv8SaFk"
  ];

  for (const address of wallets) {
    console.log(`\n--- Fetching transactions for wallet: ${address} ---`);
    try {
      const txs = await provider.fetchWalletTransactions(address, 10);
      console.log(`Fetched ${txs.length} transactions.`);
      if (txs.length === 0) {
        console.log("No transactions found.");
        continue;
      }
      
      const swaps = txs.filter(tx => tx.events?.swap || tx.type === "SWAP");
      console.log(`Of these, ${swaps.length} are swaps.`);
      
      if (txs.length > 0) {
        console.log("Latest transaction:");
        console.log(`- Time: ${new Date(txs[0].timestamp! * 1000).toISOString()}`);
        console.log(`- Type: ${txs[0].type}`);
        console.log(`- Description: ${txs[0].description}`);
        console.log(`- Signature: ${txs[0].signature}`);
      }
      
      if (swaps.length > 0) {
        console.log("Latest swap:");
        console.log(`- Time: ${new Date(swaps[0].timestamp! * 1000).toISOString()}`);
        console.log(`- Description: ${swaps[0].description}`);
        console.log(`- Signature: ${swaps[0].signature}`);
      }
    } catch (e) {
      console.error(`Failed to fetch for ${address}:`, e);
    }
  }
}

main().finally(() => process.exit(0));
