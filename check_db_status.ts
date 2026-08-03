import { prisma } from "./lib/prisma";

async function main() {
  const walletCount = await prisma.wallet.count();
  const tradeCount = await prisma.trade.count();
  const transactionCount = await prisma.transaction.count();
  const executionRecordCount = await prisma.executionRecord.count();
  const copyTradeSettingsCount = await prisma.copyTradeSettings.count();
  const globalSettings = await prisma.globalSettings.findFirst();

  console.log("=== DB STATUS ===");
  console.log("Wallets count:", walletCount);
  console.log("Trades count:", tradeCount);
  console.log("Transactions count:", transactionCount);
  console.log("Execution records count:", executionRecordCount);
  console.log("Copy trade settings count:", copyTradeSettingsCount);
  console.log("Global settings:", JSON.stringify(globalSettings, null, 2));

  const wallets = await prisma.wallet.findMany({
    include: {
      score: true,
      copyTradeSettings: true
    }
  });
  console.log("\n=== WALLETS ===");
  wallets.forEach(w => {
    console.log(`- Address: ${w.address}, Label: ${w.label}, Score: ${w.score?.totalScore ?? 'None'}, CopyTradeEnabled: ${w.copyTradeSettings?.enabled ?? false}, CreatedAt: ${w.createdAt.toISOString()}`);
  });

  const latestWallet = await prisma.wallet.findFirst({ orderBy: { createdAt: 'desc' } });
  const latestTrade = await prisma.trade.findFirst({ orderBy: { entryTime: 'desc' } });
  const latestTransaction = await prisma.transaction.findFirst({ orderBy: { timestamp: 'desc' } });
  const latestExecutionRecord = await prisma.executionRecord.findFirst({ orderBy: { timestamp: 'desc' } });

  console.log("\n=== LATEST ENTRIES ===");
  console.log("Latest Wallet created at:", latestWallet?.createdAt.toISOString() ?? "None");
  console.log("Latest Trade entryTime:", latestTrade?.entryTime.toISOString() ?? "None");
  console.log("Latest Transaction timestamp:", latestTransaction?.timestamp.toISOString() ?? "None");
  console.log("Latest ExecutionRecord timestamp:", latestExecutionRecord?.timestamp.toISOString() ?? "None");

  const executionRecords = await prisma.executionRecord.findMany({
    include: {
      wallet: true,
      token: true,
    }
  });
  console.log("\n=== EXECUTION RECORDS ===");
  executionRecords.forEach(er => {
    console.log(`- ID: ${er.id}, Wallet: ${er.wallet.address}, Token: ${er.token.symbol} (${er.token.address}), Type: ${er.type}, Status: ${er.status}, AmountSol: ${er.amountSol}, ErrorReason: ${er.errorReason}`);
  });
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
