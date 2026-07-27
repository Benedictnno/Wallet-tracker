"use client";

import { useState } from "react";
import { runDiscoveryAction } from "@/app/actions";

export default function RunDiscoveryButton() {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleDiscovery = async () => {
    setIsPending(true);
    setMessage(null);

    try {
      const result = await runDiscoveryAction();
      if (result.success) {
        setMessage({
          type: "success",
          text: `Found ${result.discovered} new wallets. Pruned ${result.pruned} low-quality wallets.`,
        });
      } else {
        setMessage({
          type: "error",
          text: result.error || "Failed to run discovery.",
        });
      }
    } catch (e) {
      setMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleDiscovery}
        disabled={isPending}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Running Discovery..." : "Discover New Wallets"}
      </button>
      {message && (
        <p className={`text-xs ${message.type === "success" ? "text-emerald-600" : "text-rose-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
