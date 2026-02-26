import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

const COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6',
  '#a855f7', '#84cc16', '#e11d48',
]

export default function PortfolioSummary({ holdings = [], quotes = {} }) {
  const data = holdings
    .map((h) => {
      const price = quotes[h.ticker]?.current_price
      const costBasis = h.cost_basis || 0
      const value = price ? h.shares * price : 0
      const invested = h.shares * costBasis
      const gainLoss = value - invested
      const gainPct = invested > 0 ? ((value - invested) / invested) * 100 : 0
      const dayChangePct = quotes[h.ticker]?.day_change_pct || 0
      return {
        name: h.ticker,
        fullName: quotes[h.ticker]?.name || h.ticker,
        value,
        invested,
        gainLoss,
        gainPct,
        dayChangePct,
        price: price || 0,
      }
    })
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = data.reduce((sum, d) => sum + d.value, 0)
  const totalInvested = data.reduce((sum, d) => sum + d.invested, 0)
  const totalGain = total - totalInvested
  const totalGainPct = totalInvested > 0 ? ((total - totalInvested) / totalInvested) * 100 : 0
  const isUp = totalGain >= 0

  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-medium text-gray-900 mb-2">Portfolio Summary</h3>
        <p className="text-sm text-gray-500">Add holdings and load market data to see allocation</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Portfolio Value</h3>
        <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {isUp ? '+' : ''}{totalGainPct.toFixed(1)}%
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-4 tabular-nums">
        ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </p>

      {/* Donut with center label */}
      <div className="relative mx-auto" style={{ width: 180, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <DollarSign size={14} className="text-gray-400 mb-0.5" />
          <p className="text-xs text-gray-500">{data.length} stocks</p>
        </div>
      </div>

      {/* Gain/Loss summary row */}
      <div className="grid grid-cols-2 gap-4 mt-4 mb-4 pt-3 border-t border-gray-100">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Invested</p>
          <p className="text-sm font-semibold text-gray-700 mt-0.5 tabular-nums">${totalInvested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total Gain/Loss</p>
          <p className={`text-sm font-semibold mt-0.5 tabular-nums ${isUp ? 'text-green-600' : 'text-red-600'}`}>
            {isUp ? '+' : ''}${totalGain.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Allocation list with bars */}
      <div className="space-y-2">
        {data.map((d, i) => {
          const pct = ((d.value / total) * 100)
          const dUp = d.dayChangePct >= 0
          return (
            <div key={d.name}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-xs font-semibold text-gray-800">{d.name}</span>
                  <span className="text-[10px] text-gray-400 truncate">{d.fullName}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className={`text-[11px] font-semibold ${dUp ? 'text-green-600' : 'text-red-500'}`}>
                    {dUp ? '+' : ''}{d.dayChangePct.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-600 font-medium tabular-nums w-[42px] text-right">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 ml-[18px]" style={{ width: 'calc(100% - 18px)' }}>
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
