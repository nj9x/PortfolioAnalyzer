import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

const TYPE_COLORS = {
  equity: '#6366f1',
  fixed_income: '#3b82f6',
  alternatives: '#f59e0b',
  cash: '#10b981',
  real_estate: '#8b5cf6',
  commodities: '#f97316',
  crypto: '#06b6d4',
}

const TYPE_LABELS = {
  equity: 'Equities',
  fixed_income: 'Fixed Income',
  alternatives: 'Alternatives',
  cash: 'Cash',
  real_estate: 'Real Estate',
  commodities: 'Commodities',
  crypto: 'Crypto',
}

export default function AssetAllocationBreakdown({ allocation }) {
  if (!allocation?.buckets?.length) return null

  const { buckets, total } = allocation
  const data = buckets.map((b) => ({
    name: TYPE_LABELS[b.type] || b.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: b.value,
    weight: b.weight_pct,
    count: b.count,
    color: TYPE_COLORS[b.type] || '#94a3b8',
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Asset Allocation</h3>

      <div className="flex items-start gap-6">
        {/* Pie Chart */}
        <div className="shrink-0" style={{ width: 140, height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend / Table */}
        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-xs font-medium text-gray-700">{d.name}</span>
                {d.count > 0 && (
                  <span className="text-[10px] text-gray-400">({d.count})</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 tabular-nums">
                  ${d.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-xs font-semibold text-gray-800 tabular-nums w-[40px] text-right">
                  {d.weight.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
