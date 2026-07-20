"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SyncWalletButtonProps = {
  walletId: string;
};

export default function SyncWalletButton({ walletId }: SyncWalletButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/wallets/${walletId}/sync`, {
      method: "POST",
    });

    const payload = (await response.json()) as
      | { error?: string; importedTransactions?: number }
      | undefined;

    if (!response.ok) {
      setError(payload?.error || "Failed to sync wallet activity.");
      return;
    }

    setMessage(
      typeof payload?.importedTransactions === "number"
        ? `Imported ${payload.importedTransactions} parsed transactions.`
        : "Wallet activity synced."
    );

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isPending}
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Syncing..." : "Sync Wallet"}
      </button>

      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
