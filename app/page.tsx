import Link from "next/link";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
import WalletForm from "@/components/WalletForm";
import RunDiscoveryButton from "@/components/RunDiscoveryButton";
import RefreshButton from "@/components/RefreshButton";
import WalletBalanceWidget from "@/components/WalletBalanceWidget";
import { prisma } from "@/lib/prisma";
import {
  formatWalletAddress,
  getScoreTone,
  parseWalletInput,
  type WalletFormState,
} from "@/lib/wallets";
import { walletIngestionService } from "@/services/WalletIngestionService";

async function addWalletAction(
  _prevState: WalletFormState,
  formData: FormData
): Promise<WalletFormState> {
  "use server";

  const parsed = parseWalletInput({
    label: formData.get("label"),
    address: formData.get("address"),
    chain: formData.get("chain"),
  });

  if (parsed.error || !parsed.data) {
    return { error: parsed.error || "Invalid input" };
  }

  const existingWallet = await prisma.wallet.findFirst({
    where: {
      address: parsed.data.address,
      chain: parsed.data.chain,
    },
  });

  if (existingWallet) {
    return { error: "That wallet is already being tracked on this chain." };
  }

  const wallet = await prisma.wallet.create({
    data: parsed.data,
  });

  let success = "Wallet added to the radar.";

  if (wallet.chain === "Solana") {
    const syncResult = await walletIngestionService.syncWalletActivity(wallet.id);

    if (syncResult.status === "synced") {
      success =
        syncResult.importedTransactions > 0
          ? `Wallet added and synced. Imported ${syncResult.importedTransactions} parsed transactions.`
          : "Wallet added and synced, but no parsable transactions were imported yet.";
    } else if (syncResult.status === "not_configured") {
      success =
        "Wallet added, but sync is disabled until HELIUS_API_KEY is configured.";
    } else if (syncResult.status === "unsupported_chain") {
      success = syncResult.message;
    }
  }

  revalidatePath("/");
  return { success };
}

export default async function Home() {
  const wallets = await prisma.wallet.findMany({
    include: {
      score: true,
      _count: {
        select: {
          transactions: true,
          trades: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const rankedWallets = [...wallets].sort(
    (left, right) => (right.score?.totalScore ?? -1) - (left.score?.totalScore ?? -1)
  );
  const scoredWallets = wallets.filter((wallet) => wallet.score && !wallet.isSuspectedBot);
  const averageScore = scoredWallets.length
    ? scoredWallets.reduce((sum, wallet) => sum + (wallet.score?.totalScore ?? 0), 0) /
      scoredWallets.length
    : 0;
  const eliteWalletCount = scoredWallets.filter(
    (wallet) => (wallet.score?.totalScore ?? 0) >= 85
  ).length;
  const topWallet = rankedWallets.find((wallet) => wallet.score);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="rounded-3xl bg-slate-950 px-8 py-10 text-white shadow-xl">
          <p className="text-sm uppercase tracking-[0.24em] text-sky-300">
            Smart Wallet Radar
          </p>
          <div className="mt-1 flex justify-end gap-3">
            <RefreshButton />
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/20 transition"
            >
              📋 Trade History
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/20 transition"
            >
              ⚙️ Settings
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold tracking-tight">
                Discover wallets worth following before the crowd does.
              </h1>
              <p className="mt-3 text-slate-300">
                Track promising wallets, review score breakdowns, and build the
                analytics layer that will feed future Solana intelligence.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">
                  Tracked
                </p>
                <p className="mt-2 text-2xl font-semibold">{wallets.length}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">
                  Scored
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {scoredWallets.length}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">
                  Avg Score
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {Math.round(averageScore)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-300">
                  Elite
                </p>
                <p className="mt-2 text-2xl font-semibold">{eliteWalletCount}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_2fr]">
          <div className="flex flex-col gap-6">
            <WalletBalanceWidget />
            <WalletForm action={addWalletAction} />
          </div>
          
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Leaderboard Snapshot
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Highest-ranked wallets based on the current scoring layer.
                </p>
              </div>
              <RunDiscoveryButton />
            </div>

            {rankedWallets.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                Add a wallet to start building the leaderboard.
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {rankedWallets.slice(0, 5).map((wallet, index) => (
                  <Link
                    key={wallet.id}
                    href={`/wallet/${wallet.id}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                        #{index + 1} {wallet.label || formatWalletAddress(wallet.address)}
                        {wallet.isSuspectedBot && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                            BOT
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {wallet.chain} · {formatWalletAddress(wallet.address)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-semibold ${getScoreTone(
                          wallet.score?.totalScore
                        )}`}
                      >
                        {wallet.score ? Math.round(wallet.score.totalScore) : "--"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {wallet.score?.classification || "Pending score"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {wallets.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-2 text-2xl font-semibold text-slate-900">
              No Wallets Tracked Yet
            </h2>
            <p className="mb-4 text-slate-600">
              Add your first wallet to start tracking!
            </p>
          </div>
        ) : (
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Wallet Coverage
                </h2>
                <p className="text-sm text-slate-600">
                  Each wallet page is the foundation for future transaction and
                  copy-trading analytics.
                </p>
              </div>
              {topWallet ? (
                <p className="text-sm text-slate-500">
                  Current leader:{" "}
                  <span className="font-medium text-slate-900">
                    {topWallet.label || formatWalletAddress(topWallet.address)}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {wallets.map((wallet) => (
              <Link
                key={wallet.id}
                href={`/wallet/${wallet.id}`}
                className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                      {wallet.label || "Unnamed Wallet"}
                      {wallet.isSuspectedBot && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                            BOT
                          </span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{wallet.chain}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {wallet.score?.classification || "Unscored"}
                  </div>
                </div>

                <p className="mt-4 break-all text-sm text-slate-600">
                  {wallet.address}
                </p>

                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Score
                    </p>
                    <p className={`mt-2 text-lg font-semibold ${getScoreTone(wallet.score?.totalScore)}`}>
                      {wallet.score ? Math.round(wallet.score.totalScore) : "--"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Trades
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {wallet._count.trades}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Txns
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {wallet._count.transactions}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
