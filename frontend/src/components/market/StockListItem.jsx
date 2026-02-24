import { Link } from 'react-router-dom'
import clsx from 'clsx'

function formatMarketCap(val) {
  if (!val) return null
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  return `$${val.toLocaleString()}`
}

export default function StockListItem({ ticker, data }) {
  if (!data || data.error) {
    return (
      <Link to={`/stock/${ticker}`} className="block">
        <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
          <p className="font-bold text-gray-900 text-sm">{ticker}</p>
          <p className="text-xs text-gray-400 mt-1">Data unavailable</p>
        </div>
      </Link>
    )
  }

  const changePct = data.day_change_pct
  const isUp = changePct > 0
  const isDown = changePct < 0

  return (
    <Link to={`/stock/${ticker}`} className="block">
      <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
        {/* Top row: icon badge + change pill */}
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
            {ticker.slice(0, 2)}
          </div>
          <span
            className={clsx(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              isUp && 'bg-green-50 text-green-700',
              isDown && 'bg-red-50 text-red-700',
              !isUp && !isDown && 'bg-gray-50 text-gray-500'
            )}
          >
            {changePct != null
              ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
              : '—'}
          </span>
        </div>

        {/* Ticker + Name */}
        <p className="font-bold text-gray-900 text-sm leading-tight">{ticker}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{data.name || ticker}</p>

        {/* Price + Market Cap */}
        <div className="mt-3 flex items-end justify-between">
          <p className="text-lg font-semibold text-gray-900 tabular-nums leading-none">
            ${data.current_price?.toFixed(2) ?? '—'}
          </p>
          {data.market_cap && (
            <p className="text-xs text-gray-400">{formatMarketCap(data.market_cap)}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
