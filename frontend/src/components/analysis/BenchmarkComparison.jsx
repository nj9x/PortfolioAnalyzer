import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

const PERIOD_MONTHS = { '3M': 3, '6M': 6, '1Y': 12 }

export default function BenchmarkComparison({ benchmark }) {
  const [selectedPeriod, setSelectedPeriod] = useState('1Y')

  const filteredData = useMemo(() => {
    if (!benchmark?.dates?.length) return []

    const months = PERIOD_MONTHS[selectedPeriod] || 12
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - months)
    const cutoffStr = cutoffDate.toISOString().slice(0, 10)

    const data = []
    for (let i = 0; i < benchmark.dates.length; i++) {
      if (benchmark.dates[i] >= cutoffStr) {
        data.push({
          date: benchmark.dates[i],
          portfolio: benchmark.portfolio_index[i],
          benchmark: benchmark.benchmark_index[i],
        })
      }
    }

    // Re-normalize filtered data to 100 at the start
    if (data.length > 0) {
      const portStart = data[0].portfolio
      const benchStart = data[0].benchmark
      return data.map(d => ({
        date: d.date,
        Portfolio: parseFloat(((d.portfolio / portStart) * 100).toFixed(2)),
        [benchmark.benchmark_ticker]: parseFloat(((d.benchmark / benchStart) * 100).toFixed(2)),
      }))
    }
    return []
  }, [benchmark, selectedPeriod])

  if (!benchmark?.dates?.length) return null

  const portReturn = benchmark.portfolio_return_pct
  const benchReturn = benchmark.benchmark_return_pct
  const excess = benchmark.excess_return_pct
  const isOutperforming = excess > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Portfolio vs {benchmark.benchmark_ticker}
          </h3>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs">
              <span className="text-gray-400">Portfolio: </span>
              <span className={`font-semibold ${portReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {portReturn >= 0 ? '+' : ''}{portReturn?.toFixed(1)}%
              </span>
            </span>
            <span className="text-xs">
              <span className="text-gray-400">{benchmark.benchmark_ticker}: </span>
              <span className={`font-semibold ${benchReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {benchReturn >= 0 ? '+' : ''}{benchReturn?.toFixed(1)}%
              </span>
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isOutperforming ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {isOutperforming ? <TrendingUp size={10} className="inline mr-1" /> : <TrendingDown size={10} className="inline mr-1" />}
              {isOutperforming ? '+' : ''}{excess?.toFixed(1)}% alpha
            </span>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-1">
          {Object.keys(PERIOD_MONTHS).map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                selectedPeriod === p
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="benchPortGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(d) => d.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => `${v}`}
              domain={['dataMin - 2', 'dataMax + 2']}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(val) => [`${val.toFixed(1)}`, undefined]}
              labelFormatter={(l) => l}
            />
            <Area
              type="monotone"
              dataKey="Portfolio"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#benchPortGrad)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey={benchmark.benchmark_ticker}
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              fill="none"
              dot={false}
            />
            <Legend
              iconType="line"
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
