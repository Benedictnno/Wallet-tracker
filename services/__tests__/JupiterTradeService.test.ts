import { JupiterTradeService } from "../trade/JupiterTradeService";

// Mock ESM-only node_modules that Jest can't transform
jest.mock("@solana/web3.js", () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash: "abc", lastValidBlockHeight: 1000 }),
    sendRawTransaction: jest.fn().mockResolvedValue("mock-txid"),
    confirmTransaction: jest.fn().mockResolvedValue({}),
  })),
  Keypair: {
    fromSecretKey: jest.fn(() => { throw new Error("Invalid key"); }),
    fromSeed: jest.fn(() => ({ publicKey: { toString: () => "MockPublicKey" }, sign: jest.fn() })),
  },
  VersionedTransaction: {
    deserialize: jest.fn(() => ({ sign: jest.fn(), serialize: jest.fn(() => Buffer.from("tx")) })),
  },
}));
jest.mock("bs58", () => ({ decode: jest.fn(() => { throw new Error("Invalid base58"); }) }));
jest.mock("bip39", () => ({ mnemonicToSeedSync: jest.fn(() => Buffer.alloc(64)) }));
jest.mock("ed25519-hd-key", () => ({ derivePath: jest.fn(() => ({ key: Buffer.alloc(32) })) }));

// Mock global fetch so we don't make real network calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

const SERVICE = new JupiterTradeService();

const MOCK_QUOTE_RESPONSE = {
  inputMint: "So11111111111111111111111111111111111111112",
  inAmount: "100000000", // 0.1 SOL in lamports
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  outAmount: "1000000", // 1 USDC (6 decimals)
  otherAmountThreshold: "990000",
  swapMode: "ExactIn",
  slippageBps: 300,
  priceImpactPct: "0.12",
  routePlan: [],
};

describe("JupiterTradeService", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("solToLamports", () => {
    it("converts 1 SOL to 1_000_000_000 lamports", () => {
      expect(SERVICE.solToLamports(1)).toBe(1_000_000_000);
    });

    it("converts 0.1 SOL correctly", () => {
      expect(SERVICE.solToLamports(0.1)).toBe(100_000_000);
    });

    it("floors fractional lamports", () => {
      expect(SERVICE.solToLamports(0.0000000001)).toBe(0);
    });
  });

  describe("getQuote", () => {
    it("returns null for invalid params (no outputMint)", async () => {
      const result = await SERVICE.getQuote({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "",
        amountLamports: 1_000_000,
      });
      expect(result).toBeNull();
    });

    it("returns null for zero amount", async () => {
      const result = await SERVICE.getQuote({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amountLamports: 0,
      });
      expect(result).toBeNull();
    });

    it("returns null when the API call fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

      const result = await SERVICE.getQuote({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amountLamports: 100_000_000,
      });
      expect(result).toBeNull();
    });

    it("returns a calculated quote for a successful API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_QUOTE_RESPONSE,
      });

      const result = await SERVICE.getQuote({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amountLamports: 100_000_000,
        slippageBps: 300,
      });

      expect(result).not.toBeNull();
      expect(result!.inAmountSol).toBeCloseTo(0.1, 5);
      expect(result!.slippageBps).toBe(300);
      expect(result!.priceImpactPct).toBeCloseTo(0.12, 2);
      expect(result!.rawQuote).toEqual(MOCK_QUOTE_RESPONSE);
    });
  });

  describe("getWalletFromEnv", () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("returns null when no key is set", () => {
      delete process.env.SOLANA_PRIVATE_KEY;
      delete process.env.SOLANA_MNEMONIC;
      const result = SERVICE.getWalletFromEnv();
      expect(result).toBeNull();
    });

    it("returns null for an invalid private key", () => {
      process.env.SOLANA_PRIVATE_KEY = "not_a_valid_key";
      const result = SERVICE.getWalletFromEnv();
      expect(result).toBeNull();
    });
  });
});
