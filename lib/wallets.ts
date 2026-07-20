export const SUPPORTED_CHAINS = ["Solana", "Ethereum", "Base", "Arbitrum"] as const;

export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export type WalletFormState = {
  error?: string;
  success?: string;
};

type ParsedWalletInput = {
  address: string;
  chain: SupportedChain;
  label?: string;
};

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function parseWalletInput(input: {
  address: FormDataEntryValue | null | undefined;
  chain: FormDataEntryValue | null | undefined;
  label: FormDataEntryValue | null | undefined;
}): { data?: ParsedWalletInput; error?: string } {
  const address = `${input.address ?? ""}`.trim();
  const chain = `${input.chain ?? ""}`.trim() as SupportedChain;
  const label = `${input.label ?? ""}`.trim();

  if (!SUPPORTED_CHAINS.includes(chain)) {
    return { error: "Please select a supported chain." };
  }

  if (!address) {
    return { error: "Wallet address is required." };
  }

  if (chain === "Solana" && !SOLANA_ADDRESS_REGEX.test(address)) {
    return { error: "Enter a valid Solana wallet address." };
  }

  if (chain !== "Solana" && !EVM_ADDRESS_REGEX.test(address)) {
    return { error: `Enter a valid ${chain} wallet address.` };
  }

  return {
    data: {
      address,
      chain,
      label: label || undefined,
    },
  };
}

export function formatWalletAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getScoreTone(score?: number | null) {
  if (score == null) {
    return "text-slate-500";
  }

  if (score >= 85) {
    return "text-emerald-600";
  }

  if (score >= 70) {
    return "text-blue-600";
  }

  if (score >= 40) {
    return "text-amber-600";
  }

  return "text-rose-600";
}
