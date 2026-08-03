import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);
  
  // Use a token from the trending list
  const tokenAddress = "SooEj828BSjtgTecBRkqBJ4oquc713yyFZqbCawawoN";
  console.log("Fetching transactions for", tokenAddress);
  try {
    const txs = await provider.fetchWalletTransactions(tokenAddress, 5);
    console.log("Fetched txs count:", txs.length);
    if (txs.length > 0) {
      console.log("Sample Tx 1:", JSON.stringify(txs[0], null, 2));
    }
  } catch (err) {
    console.error("Error during fetch:", err);
  }
}

main().finally(() => process.exit(0));
