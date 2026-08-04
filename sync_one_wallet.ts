import "dotenv/config";
import { walletIngestionService } from "./services/WalletIngestionService";
import { walletTrackerService } from "./services/WalletTrackerService";

async function main() {
  const walletId = "e5bb50ef-9a73-4d97-85c5-9cf211316b63";
  console.log(`Syncing wallet ${walletId}...`);
  try {
    const syncResult = await walletIngestionService.syncWalletActivity(walletId);
    console.log("Sync result:", JSON.stringify(syncResult, null, 2));

    const refreshResult = await walletTrackerService.refreshWalletAnalysis(walletId);
    console.log("Refresh result:", JSON.stringify(refreshResult, null, 2));
  } catch (err) {
    console.error("Failed:", err);
  }
}

main().finally(() => process.exit(0));
