import { Link } from 'react-router-dom'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Trophy, AlertTriangle } from 'lucide-react'

function MiniSparkline({ data, color }) {
  if (!data || data.length < 2) return <div className="w-full h-full" />
  const id = `perf-spark-${color.replace('#', '')}-${Math.random().toString(36).slice(2, 6)}`
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function PerformerCard({ holding, quote, sparkData, label, icon: Icon, accentColor, bgColor }) {
  const ticker = holding.ticker
  const shares = holding.shares || 0
  const costBasis = holding.cost_basis || 0
  const invested = shares * costBasis
  const currentPrice = quote?.current_price || 0
  const currentValue = shares * currentPrice
  const gainLoss = currentValue - invested
  const gainPct = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0
  const isUp = gainPct >= 0

  return (
    <Link to={`/stock/${ticker}`} className="block">
      <div className={`${bgColor} rounded-xl border p-4 hover:shadow-md transition-shadow`}>
        {/* Top: label + sparkline */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentColor}`}>
              <Icon size={14} className="text-white" />
            </div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
          </div>
          <div className="w-[80px] h-[36px] shrink-0">
            <MiniSparkline data={sparkData} color={isUp ? '#22c55e' : '#ef4444'} />
          </div>
        </div>

        {/* Ticker + pct */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-gray-900 text-base">{ticker}</span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${isUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {isUp ? '+' : ''}{gainPct.toFixed(1)}%
          </span>
        </div>
        <p className="text-xs text-gray-500 truncate mb-3">{quote?.name || ticker}</p>

        {/* Stats — 2 rows, label : value on each line */}
        <div className="space-y-2 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Invested</span>
            <span className="text-sm font-semibold text-gray-700 tabular-nums">${invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Current Value</span>
            <span className="text-sm font-semibold text-gray-700 tabular-nums">${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Gain / Loss</span>
            <span className={`text-sm font-semibold tabular-nums ${isUp ? 'text-green-600' : 'text-red-600'}`}>
              {isUp ? '+' : ''}${gainLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-400">Price</span>
            <span className="text-sm font-semibold text-gray-700 tabular-nums">${currentPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function TopBottomPerformers({ holdings, quotes, sparklines }) {
  if (!holdings || holdings.length === 0) return null

  // Compute gain % for each holding
  const ranked = holdings
    .filter(h => {
      const q = quotes[h.ticker]
      return q?.current_price && h.cost_basis > 0
    })
    .map(h => {
      const q = quotes[h.ticker]
      const gainPct = ((q.current_price - h.cost_basis) / h.cost_basis) * 100
      return { ...h, gainPct }
    })
    .sort((a, b) => b.gainPct - a.gainPct)

  if (ranked.length === 0) return null

  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]

  return (
    <div className="flex flex-col gap-4">
      <PerformerCard
        holding={top}
        quote={quotes[top.ticker]}
        sparkData={sparklines[top.ticker]}
        label="Top Performer"
        icon={Trophy}
        accentColor="bg-green-500"
        bgColor="bg-white border-green-100"
      />
      {ranked.length > 1 && (
        <PerformerCard
          holding={bottom}
          quote={quotes[bottom.ticker]}
          sparkData={sparklines[bottom.ticker]}
          label="Bottom Performer"
          icon={AlertTriangle}
          accentColor="bg-red-500"
          bgColor="bg-white border-red-100"
        />
      )}
    </div>
  )
}
