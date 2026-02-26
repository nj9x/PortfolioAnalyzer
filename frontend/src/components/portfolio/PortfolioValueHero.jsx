import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import clsx from 'clsx'
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function formatCurrency(val) {
  if (!val) return '$0'
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
  return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function PortfolioValueHero({ holdings = [], quotes = {} }) {
  // Compute allocation data
  const allocData = holdings
    .map((h) => {
      const price = quotes[h.ticker]?.current_price
      const value = price ? h.shares * price : 0
      const cost = h.cost_basis ? h.shares * h.cost_basis : 0
      const gainPct = h.cost_basis && h.cost_basis > 0 && price
        ? ((price - h.cost_basis) / h.cost_basis) * 100
        : null
      return { ticker: h.ticker, value, cost, gainPct, shares: h.shares, price }
    })
    .filter((d) => d.value > 0)

  const totalValue = allocData.reduce((s, d) => s + d.value, 0)
  const totalCost = allocData.reduce((s, d) => s + d.cost, 0)
  const totalReturnPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null
  const totalGainLoss = totalValue - totalCost

  // Compute day change
  let dayChangeValue = 0
  for (const h of holdings) {
    const q = quotes[h.ticker]
    if (q?.current_price && q?.day_change_pct) {
      const holdingValue = h.shares * q.current_price
      dayChangeValue += holdingValue * (q.day_change_pct / 100)
    }
  }
  const dayChangePct = totalValue > 0 ? (dayChangeValue / totalValue) * 100 : 0

  // Best / Worst performers
  const withGain = allocData.filter(d => d.gainPct != null)
  const best = withGain.length > 0 ? withGain.reduce((a, b) => a.gainPct > b.gainPct ? a : b) : null
  const worst = withGain.length > 0 ? withGain.reduce((a, b) => a.gainPct < b.gainPct ? a : b) : null

  const pieData = allocData.map(d => ({ name: d.ticker, value: d.value }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex gap-6">
        {/* Left: Value + Metrics */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Portfolio Balance</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{formatCurrency(totalValue)}</p>

          {/* Return badges */}
          <div className="flex items-center gap-3 mt-2">
            {totalReturnPct != null && (
              <div className={clsx(
                'flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-lg',
                totalReturnPct >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              )}>
                {totalReturnPct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(2)}%
                <span className="text-xs font-normal ml-1 opacity-70">total</span>
              </div>
            )}
            {dayChangePct !== 0 && (
              <div className={clsx(
                'flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg',
                dayChangePct >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
              )}>
                {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}% today
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase">Invested</p>
              <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(totalCost)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase">Gain/Loss</p>
              <p className={clsx(
                'text-sm font-bold tabular-nums',
                totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalGainLoss))}
              </p>
            </div>
            {best && (
              <div className="bg-green-50/50 rounded-lg px-3 py-2">
                <p className="text-[10px] font-medium text-gray-400 uppercase">Best</p>
                <p className="text-sm font-bold text-green-600">
                  {best.ticker} <span className="font-semibold">+{best.gainPct.toFixed(1)}%</span>
                </p>
              </div>
            )}
            {worst && (
              <div className="bg-red-50/50 rounded-lg px-3 py-2">
                <p className="text-[10px] font-medium text-gray-400 uppercase">Worst</p>
                <p className="text-sm font-bold text-red-600">
                  {worst.ticker} <span className="font-semibold">{worst.gainPct.toFixed(1)}%</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Donut chart */}
        {pieData.length > 0 && (
          <div className="w-48 shrink-0">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Value']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  {d.name} {((d.value / totalValue) * 100).toFixed(0)}%
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
