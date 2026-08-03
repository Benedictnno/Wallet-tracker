import "dotenv/config";

async function main() {
  const apiKey = process.env.HELIUS_API_KEY!;
  const signature = "5vcsVWUTxTuY5yFgk5Y36m15C5Pqbdu7YBv3za8txMtVacZ6JTd19af2oenja6gbmr9PSx2LqJfVLYL72gLCPCrW";
  
  const url = `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`;
  console.log("Fetching transaction detail for signature:", signature);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: [signature] })
    });

    if (!response.ok) {
      console.error("Failed:", response.status, await response.text());
      return;
    }

    const data = await response.json();
    if (data.length > 0) {
      console.log("Root keys:", Object.keys(data[0]));
      console.log("tokenTransfers:", data[0].tokenTransfers);
      console.log("tokenBalanceChanges:", data[0].tokenBalanceChanges);
    }
  } catch (err) {
    console.error(err);
  }
}

main().finally(() => process.exit(0));
