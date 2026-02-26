import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function PerformanceAttribution({ attributions }) {
  if (!attributions?.length) return null

  // Top 10 contributors
  const data = attributions.slice(0, 10).map((a) => ({
    ticker: a.ticker,
    contribution: a.contribution_pct,
    weight: a.weight_pct,
    return: a.return_pct,
    value: a.market_value,
  }))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Performance Attribution
      </h3>

      {/* Horizontal bar chart */}
      <div style={{ height: Math.max(160, data.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              tick={{ fontSize: 11, fill: '#374151', fontWeight: 600 }}
              width={44}
            />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(val, name) => [`${val.toFixed(2)}%`, 'Contribution']}
              labelFormatter={(l) => l}
            />
            <Bar dataKey="contribution" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.contribution >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="grid grid-cols-5 gap-2 text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-2 px-1">
          <span>Ticker</span>
          <span className="text-right">Weight</span>
          <span className="text-right">Return</span>
          <span className="text-right">Contribution</span>
          <span className="text-right">Value</span>
        </div>
        <div className="space-y-1">
          {data.map((d) => (
            <div key={d.ticker} className="grid grid-cols-5 gap-2 text-xs px-1 py-1 hover:bg-gray-50 rounded">
              <span className="font-semibold text-gray-800">{d.ticker}</span>
              <span className="text-right text-gray-600 tabular-nums">{d.weight.toFixed(1)}%</span>
              <span className={`text-right font-semibold tabular-nums ${d.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {d.return >= 0 ? '+' : ''}{d.return.toFixed(1)}%
              </span>
              <span className={`text-right font-semibold tabular-nums ${d.contribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {d.contribution >= 0 ? '+' : ''}{d.contribution.toFixed(2)}%
              </span>
              <span className="text-right text-gray-600 tabular-nums">
                ${d.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
