import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

export default function StockQuoteCard({ ticker, data }) {
  if (!data || data.error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="font-medium text-gray-900">{ticker}</p>
        <p className="text-xs text-gray-400">Data unavailable</p>
      </div>
    )
  }

  const change = data.day_change_pct
  const isUp = change > 0
  const isDown = change < 0

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-gray-900">{ticker}</p>
          <p className="text-xs text-gray-500 truncate max-w-[140px]">{data.name}</p>
        </div>
        {isUp ? (
          <TrendingUp size={16} className="text-green-500" />
        ) : isDown ? (
          <TrendingDown size={16} className="text-red-500" />
        ) : (
          <Minus size={16} className="text-gray-400" />
        )}
      </div>
      <p className="text-xl font-semibold mt-2">
        ${data.current_price?.toFixed(2) ?? '-'}
      </p>
      <p
        className={clsx(
          'text-sm font-medium',
          isUp && 'text-green-600',
          isDown && 'text-red-600',
          !isUp && !isDown && 'text-gray-500'
        )}
      >
        {change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '-'}
      </p>
      <div className="mt-2 text-xs text-gray-500 space-y-0.5">
        {data.pe_ratio && <p>P/E: {data.pe_ratio.toFixed(1)}</p>}
        {data.sector && <p>{data.sector}</p>}
      </div>
    </div>
  )
}
