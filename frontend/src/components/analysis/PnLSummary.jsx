import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import clsx from 'clsx'

function PnlCard({ label, dollar, pct }) {
  const isUp = dollar >= 0
  return (
    <div className="flex flex-col items-center px-4 py-2.5">
      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">{label}</span>
      <div className="flex items-center gap-1">
        {isUp ? <TrendingUp size={12} className="text-green-500" /> : <TrendingDown size={12} className="text-red-500" />}
        <span className={clsx('text-sm font-bold tabular-nums', isUp ? 'text-green-600' : 'text-red-600')}>
          {isUp ? '+' : ''}${Math.abs(dollar).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <span className={clsx('text-[11px] font-semibold tabular-nums', isUp ? 'text-green-600' : 'text-red-600')}>
        {isUp ? '+' : ''}{pct?.toFixed(2)}%
      </span>
    </div>
  )
}

export default function PnLSummary({ pnl }) {
  if (!pnl) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={14} className="text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">P&L Overview</h3>
      </div>
      <div className="flex items-center justify-around divide-x divide-gray-100">
        <PnlCard label="Daily" dollar={pnl.daily?.dollar || 0} pct={pnl.daily?.pct || 0} />
        <PnlCard label="MTD" dollar={pnl.mtd?.dollar || 0} pct={pnl.mtd?.pct || 0} />
        <PnlCard label="YTD" dollar={pnl.ytd?.dollar || 0} pct={pnl.ytd?.pct || 0} />
      </div>
    </div>
  )
}
