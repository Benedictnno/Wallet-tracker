import { getBotWalletBalance } from "@/app/actions/walletActions";

export default async function WalletBalanceWidget() {
  const result = await getBotWalletBalance();

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-4 rounded-xl shadow-md mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-500/20 p-3 rounded-full border border-indigo-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a8 8 0 0 1-5 7.59l-9.74 4.11a2 2 0 0 1-2.52-1L2.1 15.39"/>
            <path d="M15 12a2 2 0 0 0 0 4"/>
          </svg>
        </div>
        <div>
          <h3 className="text-slate-400 text-sm font-medium">My Bot Wallet</h3>
          {result.success ? (
            <p className="text-slate-200 font-mono text-xs mt-1">
              {result.address?.slice(0, 8)}...{result.address?.slice(-8)}
            </p>
          ) : (
            <p className="text-red-400 text-xs mt-1">Not configured</p>
          )}
        </div>
      </div>
      
      <div className="bg-slate-900/80 px-5 py-3 rounded-lg border border-slate-700/50 flex items-baseline gap-2">
        {result.success ? (
          <>
            <span className="text-2xl font-bold text-white">{result.balanceSol?.toFixed(4)}</span>
            <span className="text-slate-400 font-medium">SOL</span>
          </>
        ) : (
          <span className="text-slate-500 text-sm">{result.error}</span>
        )}
      </div>
    </div>
  );
}
