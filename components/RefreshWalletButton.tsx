"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RefreshWalletButtonProps = {
  walletId: string;
};

export default function RefreshWalletButton({
  walletId,
}: RefreshWalletButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/wallets/${walletId}/refresh`, {
      method: "POST",
    });

    const payload = (await response.json()) as
      | { message?: string; error?: string; status?: string }
      | undefined;

    if (!response.ok) {
      setError(payload?.error || "Failed to refresh wallet analysis.");
      return;
    }

    setMessage(payload?.message || "Wallet analysis refreshed.");
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isPending}
        className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Refreshing..." : "Refresh Analysis"}
      </button>

      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
