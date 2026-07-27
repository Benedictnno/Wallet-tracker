import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export type JupiterQuoteParams = {
  inputMint: string;
  outputMint: string;
  amountLamports: number;
  slippageBps?: number;
};

export type JupiterQuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan?: any[];
};

export type CalculatedQuote = {
  inAmountSol: number;
  outAmountRaw: bigint;
  outAmountFormatted: number;
  pricePerTokenSol: number;
  slippageBps: number;
  priceImpactPct: number;
  rawQuote: JupiterQuoteResponse;
};

export class JupiterTradeService {
  /**
   * Fetch a swap quote from Jupiter Aggregator API.
   */
  async getQuote(params: JupiterQuoteParams): Promise<CalculatedQuote | null> {
    try {
      const {
        inputMint = NATIVE_SOL_MINT,
        outputMint,
        amountLamports,
        slippageBps = 300,
      } = params;

      if (!outputMint || amountLamports <= 0) {
        return null;
      }

      const url = new URL(JUPITER_QUOTE_API);
      url.searchParams.set("inputMint", inputMint);
      url.searchParams.set("outputMint", outputMint);
      url.searchParams.set("amount", Math.floor(amountLamports).toString());
      url.searchParams.set("slippageBps", slippageBps.toString());

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn(`[JupiterTradeService] Failed to fetch quote: status ${response.status}`);
        return null;
      }

      const quote: JupiterQuoteResponse = await response.json();

      const inAmountSol = Number(quote.inAmount) / 1e9;
      const outAmountRaw = BigInt(quote.outAmount || "0");
      // Fallback decimals calculation if unknown token: assuming 6 or 9 decimals standard,
      // but output amount is converted relative to SOL price
      const priceImpactPct = parseFloat(quote.priceImpactPct || "0");

      return {
        inAmountSol,
        outAmountRaw,
        outAmountFormatted: Number(outAmountRaw), // raw units until formatted with token decimals
        pricePerTokenSol: inAmountSol > 0 && Number(outAmountRaw) > 0 ? inAmountSol / Number(outAmountRaw) : 0,
        slippageBps: quote.slippageBps,
        priceImpactPct,
        rawQuote: quote,
      };
    } catch (error) {
      console.error("[JupiterTradeService] Error fetching quote:", error);
      return null;
    }
  }

  /**
   * Helper to convert SOL amount to Lamports integer
   */
  solToLamports(solAmount: number): number {
    return Math.floor(solAmount * 1e9);
  }

  /**
   * Helper to derive Keypair from env (either private key or mnemonic).
   */
  getWalletFromEnv(): Keypair | null {
    try {
      const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
      const mnemonic = process.env.SOLANA_MNEMONIC;

      if (privateKeyBase58) {
        return Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
      }

      if (mnemonic) {
        const seed = bip39.mnemonicToSeedSync(mnemonic, ""); // (mnemonic, password)
        const path = "m/44'/501'/0'/0'";
        const derivedSeed = derivePath(path, seed.toString("hex")).key;
        return Keypair.fromSeed(derivedSeed);
      }

      return null;
    } catch (error) {
      console.error("[JupiterTradeService] Error deriving wallet from env:", error);
      return null;
    }
  }

  /**
   * Execute a swap transaction on-chain via Jupiter API.
   * Returns the transaction signature if successful.
   */
  async executeSwap(quoteResponse: JupiterQuoteResponse): Promise<string> {
    try {
      if (!process.env.HELIUS_API_KEY) {
        throw new Error("Missing HELIUS_API_KEY for RPC connection.");
      }
      
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
      const connection = new Connection(rpcUrl, "confirmed");

      const wallet = this.getWalletFromEnv();
      if (!wallet) {
        throw new Error("Missing SOLANA_PRIVATE_KEY or SOLANA_MNEMONIC in environment.");
      }

      // 1. Get the serialized transaction from Jupiter swap API
      const swapRes = await fetch(JUPITER_SWAP_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto"
        }),
      });

      if (!swapRes.ok) {
        const errData = await swapRes.json();
        throw new Error(`Jupiter Swap API error: ${JSON.stringify(errData)}`);
      }

      const { swapTransaction } = await swapRes.json();

      if (!swapTransaction) {
        throw new Error("Jupiter returned empty swapTransaction.");
      }

      // 2. Deserialize the base64 transaction
      const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // 3. Sign the transaction
      transaction.sign([wallet]);

      // 4. Broadcast the transaction
      const latestBlockHash = await connection.getLatestBlockhash();
      const rawTransaction = transaction.serialize();
      
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });

      // 5. Confirm the transaction
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid,
      }, "confirmed");

      return txid;
    } catch (error: any) {
      console.error("[JupiterTradeService] executeSwap failed:", error);
      throw error;
    }
  }
}

export const jupiterTradeService = new JupiterTradeService();
