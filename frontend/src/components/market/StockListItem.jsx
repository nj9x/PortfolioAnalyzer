import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'
import MiniSparkline from './MiniSparkline'

export default function StockListItem({ ticker, data, sparkline }) {
  if (!data || data.error) {
    return (
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{ticker}</p>
            <p className="text-xs text-gray-400">Data unavailable</p>
          </div>
        </div>
      </div>
    )
  }

  const changePct = data.day_change_pct
  const changeDollar = data.day_change
  const isUp = changePct > 0
  const isDown = changePct < 0

  return (
    <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50 transition-colors">
      {/* Left: Ticker + Name */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="min-w-[80px]">
          <p className="font-semibold text-gray-900 text-sm">{ticker}</p>
          <p className="text-xs text-gray-500 truncate max-w-[120px]">
            {data.name || ticker}
          </p>
        </div>

        {/* Sparkline */}
        <MiniSparkline data={sparkline} width={80} height={32} />
      </div>

      {/* Right: Price + Change + Icon */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Price */}
        <p className="font-semibold text-gray-900 text-sm tabular-nums text-right min-w-[70px]">
          ${data.current_price?.toFixed(2) ?? '-'}
        </p>

        {/* Change values */}
        <div className="text-right min-w-[90px]">
          <p
            className={clsx(
              'text-sm font-medium tabular-nums',
              isUp && 'text-green-600',
              isDown && 'text-red-600',
              !isUp && !isDown && 'text-gray-500'
            )}
          >
            {changeDollar != null
              ? `${changeDollar >= 0 ? '+' : ''}${changeDollar.toFixed(2)}`
              : '-'}
          </p>
          <p
            className={clsx(
              'text-xs tabular-nums',
              isUp && 'text-green-500',
              isDown && 'text-red-500',
              !isUp && !isDown && 'text-gray-400'
            )}
          >
            {changePct != null
              ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
              : '-'}
          </p>
        </div>

        {/* Trend icon */}
        <div className="w-5">
          {isUp ? (
            <TrendingUp size={16} className="text-green-500" />
          ) : isDown ? (
            <TrendingDown size={16} className="text-red-500" />
          ) : (
            <Minus size={16} className="text-gray-400" />
          )}
        </div>
      </div>
    </div>
  )
}
