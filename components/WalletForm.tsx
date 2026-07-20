"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { SUPPORTED_CHAINS, type WalletFormState } from "@/lib/wallets";

interface WalletFormProps {
  action: (
    prevState: WalletFormState,
    formData: FormData
  ) => Promise<WalletFormState>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
    >
      {pending ? "Adding..." : "Add Wallet"}
    </button>
  );
}

export default function WalletForm({ action }: WalletFormProps) {
  const [state, formAction] = useActionState(action, {});

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-2xl font-semibold text-slate-900">Add New Wallet</h2>
      <p className="mt-2 text-sm text-slate-600">
        Start with a Solana address, then expand the radar as you add scoring
        and transaction ingestion.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="label"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Label (optional)
          </label>
          <input
            id="label"
            name="label"
            type="text"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="e.g., Smart Trader"
          />
        </div>

        <div>
          <label
            htmlFor="address"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Wallet Address
          </label>
          <input
            id="address"
            name="address"
            type="text"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="e.g., 9vpsmXhZWMmkpM25xR34QaV4iY9WvL5vZ9Q1y3wK5x7"
            required
          />
        </div>

        <div>
          <label
            htmlFor="chain"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Blockchain
          </label>
          <select
            id="chain"
            name="chain"
            defaultValue="Solana"
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            {SUPPORTED_CHAINS.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
        </div>

        {state.error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}

        {state.success ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}

        <SubmitButton />
      </form>
    </div>
  );
}
