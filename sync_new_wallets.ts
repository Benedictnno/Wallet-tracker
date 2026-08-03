import { walletIngestionService } from "./services/WalletIngestionService";
import { walletTrackerService } from "./services/WalletTrackerService";

async function main() {
  const wallets = [
    "e5bb50ef-9a73-4d97-85c5-9cf211316b63",
    "9e93ce1a-ac35-4894-8341-f261274954cf",
    "7f66e1f4-aba1-4feb-8b99-8c4c230e788b"
  ];

  for (const id of wallets) {
    console.log(`Syncing wallet: ${id}`);
    try {
      const syncResult = await walletIngestionService.syncWalletActivity(id);
      console.log(`- Sync result:`, syncResult.status, `Imported ${syncResult.importedTransactions ?? 0} txs.`);
      
      const refreshResult = await walletTrackerService.refreshWalletAnalysis(id);
      console.log(`- Refresh result:`, refreshResult.status);
    } catch (e) {
      console.error(`Failed to sync ${id}:`, e);
    }
  }
}

main().finally(() => process.exit(0));
