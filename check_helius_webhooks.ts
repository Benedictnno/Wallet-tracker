import "dotenv/config";
import { HeliusWalletProvider } from "./services/solana/HeliusWalletProvider";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const provider = new HeliusWalletProvider(apiKey);
  console.log("Fetching webhooks from Helius...");
  try {
    const webhooks = await provider.getAllWebhooks();
    webhooks.forEach((w: any) => {
      console.log(`Webhook ID: ${w.webhookID}`);
      console.log(`URL: ${w.webhookURL}`);
      console.log(`Active: ${w.active}`);
      console.log(`Account Addresses (${w.accountAddresses?.length ?? 0}):`, w.accountAddresses);
    });
  } catch (err) {
    console.error("Error fetching webhooks:", err);
  }
}

main().finally(() => process.exit(0));
