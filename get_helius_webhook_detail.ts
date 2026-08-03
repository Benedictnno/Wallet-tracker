import "dotenv/config";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const webhookId = "86a1c0ec-205e-4ec0-ac55-0b24f02ce491";
  const url = `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`;
  
  console.log("Fetching webhook details...");
  const response = await fetch(url);
  if (!response.ok) {
    console.error("Failed to fetch:", response.status, await response.text());
    return;
  }
  const data = await response.json();
  console.log("Webhook Detail:", JSON.stringify(data, null, 2));
}

main().finally(() => process.exit(0));
