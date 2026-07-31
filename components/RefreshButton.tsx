"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    startTransition(() => {
      router.refresh();
    });
    // Add a minimum visual delay so the user knows it worked
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  const pending = isPending || isRefreshing;

  return (
    <button
      onClick={handleRefresh}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/20 transition ${
        pending ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <span className={pending ? "animate-spin" : ""}>🔄</span>
      {pending ? "Refreshing..." : "Refresh"}
    </button>
  );
}
