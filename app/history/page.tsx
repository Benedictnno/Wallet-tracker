import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const records = await prisma.executionRecord.findMany({
    include: {
      token: true,
      wallet: true,
    },
    orderBy: {
      timestamp: "desc",
    },
    take: 100, // Limit to recent 100 for performance
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Bot Activity & Trade History</h1>
          <p className="text-slate-400">View recent copy-trades, paper trades, and execution statuses.</p>
        </div>
        <Link
          href="/"
          className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex-1">
        {records.length === 0 ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
              <line x1="16" x2="16" y1="2" y2="6"/>
              <line x1="8" x2="8" y1="2" y2="6"/>
              <line x1="3" x2="21" y1="10" y2="10"/>
            </svg>
            <p className="text-lg font-medium">No trade history yet</p>
            <p className="text-sm mt-1">When the bot executes a trade, it will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Target Wallet</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Token</th>
                  <th className="px-6 py-4 text-right">Amount (SOL)</th>
                  <th className="px-6 py-4 text-right">Amount (Token)</th>
                  <th className="px-6 py-4 text-right">Price</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                      <div title={record.timestamp.toLocaleString()}>
                        {formatDistanceToNow(record.timestamp, { addSuffix: true })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium text-slate-300">{record.wallet.label || 'Unknown'}</span>
                      <div className="text-xs text-slate-500 font-mono">
                        {record.wallet.address.slice(0, 4)}...{record.wallet.address.slice(-4)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        record.type === "BUY" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}>
                        {record.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium">{record.token.symbol}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {record.token.address.slice(0, 4)}...{record.token.address.slice(-4)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-slate-200">
                      {record.amountSol.toFixed(4)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-slate-400">
                      {record.amountToken ? record.amountToken.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-slate-400">
                      {record.executionPrice ? `$${record.executionPrice.toFixed(6)}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        record.status === 'EXECUTED' ? 'bg-emerald-500/10 text-emerald-400' :
                        record.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400' :
                        record.status === 'SIMULATED' ? 'bg-indigo-500/10 text-indigo-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {record.status}
                      </span>
                      {record.errorReason && (
                        <div className="text-xs text-rose-400 mt-1 max-w-[200px] truncate" title={record.errorReason}>
                          {record.errorReason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {record.targetTradeId && record.status === 'EXECUTED' && (
                        <a
                          href={`https://solscan.io/tx/${record.targetTradeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium flex items-center justify-end gap-1"
                        >
                          View Tx
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" x2="21" y1="14" y2="3"/>
                          </svg>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
