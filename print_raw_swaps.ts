import "dotenv/config";
import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);
  const tokenAddress = "SooEj828BSjtgTecBRkqBJ4oquc713yyFZqbCawawoN";
  
  console.log("Fetching transactions...");
  const txs = await provider.fetchWalletTransactions(tokenAddress, 20);
  
  txs.forEach((tx, i) => {
    const { sol, usd } = provider.getSwapValue(tx);
    console.log(`\nTx #${i}: ${tx.signature}`);
    console.log(`- Type: ${tx.type}, Source: ${tx.source}`);
    console.log(`- Extracted Swap Value: ${sol} SOL / $${usd}`);
    console.log(`- Token Transfers:`, JSON.stringify(tx.tokenTransfers, null, 2));
    console.log(`- Native Transfers:`, JSON.stringify(tx.nativeTransfers, null, 2));
  });
}

main().finally(() => process.exit(0));
