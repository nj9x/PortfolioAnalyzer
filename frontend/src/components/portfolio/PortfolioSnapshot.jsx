import clsx from 'clsx'
import { Link } from 'react-router-dom'
import MiniSparkline from '../market/MiniSparkline'

export default function PortfolioSnapshot({ holdings = [], quotes = {}, sparklines = {} }) {
  if (!holdings.length) return null

  // Build enriched holdings list
  const enriched = holdings
    .map((h) => {
      const q = quotes[h.ticker]
      const price = q?.current_price
      const value = price ? h.shares * price : 0
      const gainPct = h.cost_basis && h.cost_basis > 0 && price
        ? ((price - h.cost_basis) / h.cost_basis) * 100
        : null
      return {
        ticker: h.ticker,
        shares: h.shares,
        costBasis: h.cost_basis,
        price,
        value,
        gainPct,
        dayChangePct: q?.day_change_pct,
        name: q?.name,
        spark: sparklines[h.ticker],
      }
    })
    .sort((a, b) => b.value - a.value)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Holdings</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {enriched.map((h) => (
          <Link
            key={h.ticker}
            to={`/stock/${h.ticker}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 transition-colors"
          >
            {/* Ticker badge */}
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-600 shrink-0">
              {h.ticker.slice(0, 2)}
            </div>

            {/* Name + ticker */}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900 truncate">{h.ticker}</p>
              <p className="text-[10px] text-gray-400 truncate">
                {h.shares} shares{h.costBasis ? ` @ $${h.costBasis.toFixed(2)}` : ''}
              </p>
            </div>

            {/* Sparkline */}
            <MiniSparkline data={h.spark} width={48} height={22} />

            {/* Price + Change */}
            <div className="text-right shrink-0 w-20">
              <p className="text-xs font-semibold text-gray-900 tabular-nums">
                ${h.price?.toFixed(2) ?? '—'}
              </p>
              {h.gainPct != null && (
                <p className={clsx(
                  'text-[10px] font-semibold tabular-nums',
                  h.gainPct >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(1)}%
                </p>
              )}
            </div>

            {/* Value */}
            <div className="text-right shrink-0 w-20">
              <p className="text-xs font-bold text-gray-900 tabular-nums">
                ${h.value ? h.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
              </p>
              {h.dayChangePct != null && (
                <p className={clsx(
                  'text-[10px] tabular-nums',
                  h.dayChangePct >= 0 ? 'text-green-500' : 'text-red-500'
                )}>
                  {h.dayChangePct >= 0 ? '+' : ''}{h.dayChangePct.toFixed(2)}% today
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
