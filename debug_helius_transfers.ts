import "dotenv/config";
import { prisma } from "./lib/prisma";
import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);
  const tokenAddress = "SooEj828BSjtgTecBRkqBJ4oquc713yyFZqbCawawoN";
  
  console.log("Fetching transactions for token...");
  const txs = await provider.fetchWalletTransactions(tokenAddress, 100);
  
  console.log("Analysis of 100 transactions:");
  let countWithFeePayer = 0;
  let countWithTransfers = 0;
  let countFeePayerInTransfers = 0;
  let countWhereFeePayerIsTrader = 0;

  for (const tx of txs) {
    if (tx.feePayer) countWithFeePayer++;
    if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
      countWithTransfers++;
      
      // Let's see all unique accounts in tokenTransfers
      const accountsInTransfers = new Set<string>();
      for (const t of tx.tokenTransfers) {
        if (t.fromUserAccount) accountsInTransfers.add(t.fromUserAccount);
        if (t.toUserAccount) accountsInTransfers.add(t.toUserAccount);
      }
      
      if (tx.feePayer && accountsInTransfers.has(tx.feePayer)) {
        countFeePayerInTransfers++;
      }
      
      const isTrader = tx.tokenTransfers.some(
        (t) => t.toUserAccount === tx.feePayer || t.fromUserAccount === tx.feePayer
      );
      if (isTrader) countWhereFeePayerIsTrader++;
    }
  }

  console.log("Total txs:", txs.length);
  console.log("Txs with feePayer:", countWithFeePayer);
  console.log("Txs with tokenTransfers:", countWithTransfers);
  console.log("Txs where feePayer is in any tokenTransfer accounts:", countFeePayerInTransfers);
  console.log("Txs where feePayer is direct sender/receiver in tokenTransfers (isTrader):", countWhereFeePayerIsTrader);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
