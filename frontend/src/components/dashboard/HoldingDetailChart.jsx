import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useTickerHistory } from '../../hooks/useMarketData'
import { TrendingUp, TrendingDown } from 'lucide-react'

const PERIODS = [
  { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      <p className="font-medium mb-1">{d.date}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-gray-400">Open</span><span className="text-right">${d.open?.toFixed(2)}</span>
        <span className="text-gray-400">High</span><span className="text-right">${d.high?.toFixed(2)}</span>
        <span className="text-gray-400">Low</span><span className="text-right">${d.low?.toFixed(2)}</span>
        <span className="text-gray-400">Close</span><span className="text-right font-semibold">${d.close?.toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function HoldingDetailChart({ holdings, quotes }) {
  const tickers = holdings.map(h => h.ticker)
  const [selectedTicker, setSelectedTicker] = useState(tickers[0] || '')
  const [period, setPeriod] = useState('1mo')

  const { data: historyData, isLoading } = useTickerHistory(selectedTicker, period)
  const bars = historyData?.bars || []

  const quote = quotes[selectedTicker]
  const changePct = quote?.day_change_pct
  const isUp = changePct > 0

  // Compute chart stats from bars
  const stats = useMemo(() => {
    if (!bars.length) return {}
    const closes = bars.map(b => b.close)
    const high = Math.max(...bars.map(b => b.high))
    const low = Math.min(...bars.map(b => b.low))
    const firstClose = closes[0]
    const lastClose = closes[closes.length - 1]
    const periodChange = ((lastClose - firstClose) / firstClose) * 100
    return { high, low, open: bars[bars.length - 1]?.open, prevClose: bars[bars.length - 2]?.close, periodChange, firstClose, lastClose }
  }, [bars])

  // Chart color based on period performance
  const chartUp = (stats.periodChange ?? 0) >= 0
  const chartColor = chartUp ? '#22c55e' : '#ef4444'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header: Ticker tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin pb-1">
          {tickers.map(t => (
            <button
              key={t}
              onClick={() => setSelectedTicker(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                t === selectedTicker
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Price + change */}
      <div className="flex items-end gap-3 mb-4">
        <p className="text-2xl font-bold text-gray-900 tabular-nums">
          ${quote?.current_price?.toFixed(2) ?? '—'}
        </p>
        <div className="flex items-center gap-1 pb-0.5">
          {isUp ? <TrendingUp size={16} className="text-green-500" /> : changePct < 0 ? <TrendingDown size={16} className="text-red-500" /> : null}
          <span className={`text-sm font-semibold ${isUp ? 'text-green-600' : changePct < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% today` : ''}
          </span>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-1 mb-4">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              p.key === period
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {p.label}
          </button>
        ))}
        {stats.periodChange != null && (
          <span className={`ml-auto text-xs font-semibold ${chartUp ? 'text-green-600' : 'text-red-600'}`}>
            {chartUp ? '+' : ''}{stats.periodChange.toFixed(2)}% period
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="h-[220px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading chart...</div>
        ) : bars.length < 2 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bars} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={55}
                tickFormatter={v => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#chartGrad)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats row */}
      {bars.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mt-4 pt-3 border-t border-gray-100">
          <div>
            <p className="text-[10px] text-gray-400 uppercase">High</p>
            <p className="text-sm font-semibold text-gray-800">${stats.high?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Low</p>
            <p className="text-sm font-semibold text-gray-800">${stats.low?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Open</p>
            <p className="text-sm font-semibold text-gray-800">${stats.open?.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase">Prev Close</p>
            <p className="text-sm font-semibold text-gray-800">${stats.prevClose?.toFixed(2) ?? '—'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
