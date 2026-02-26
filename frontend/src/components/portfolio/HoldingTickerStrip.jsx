import { Link } from 'react-router-dom'
import clsx from 'clsx'
import MiniSparkline from '../market/MiniSparkline'

export default function HoldingTickerStrip({ holdings = [], quotes = {}, sparklines = {} }) {
  if (!holdings.length) return null

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
      {holdings.map((h) => {
        const q = quotes[h.ticker]
        const spark = sparklines[h.ticker]
        const changePct = q?.day_change_pct
        const isUp = changePct > 0
        const isDown = changePct < 0

        return (
          <Link
            key={h.ticker}
            to={`/stock/${h.ticker}`}
            className="shrink-0 bg-white rounded-xl border border-gray-200 px-3.5 py-2.5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer min-w-[150px]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{h.ticker}</span>
                  <span
                    className={clsx(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
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
                <p className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">
                  ${q?.current_price?.toFixed(2) ?? '—'}
                </p>
              </div>
              <MiniSparkline data={spark} width={56} height={28} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
