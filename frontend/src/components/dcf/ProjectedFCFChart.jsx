import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

function formatValue(val) {
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(0)}K`
  return val.toFixed(0)
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const data = payload[0]?.payload
  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-lg p-3 shadow-xl text-sm backdrop-blur-sm">
      <p className="font-semibold text-slate-200 mb-1.5">Year {data.year}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-slate-400 text-xs">Projected FCF</span>
          </span>
          <span className="text-blue-400 font-medium">${formatValue(data.fcf)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-400 text-xs">Present Value</span>
          </span>
          <span className="text-emerald-400 font-medium">${formatValue(data.pv_fcf)}</span>
        </div>
        <div className="border-t border-slate-700 pt-1 mt-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 text-xs">Growth Rate</span>
            <span className="text-slate-300 text-xs font-medium">{(data.growth_rate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProjectedFCFChart({ projections }) {
  if (!projections?.length) return null

  const data = projections.map(p => ({
    ...p,
    name: `Year ${p.year}`,
  }))

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/60 p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h4 className="text-sm font-semibold text-slate-200">Projected Free Cash Flows</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{projections.length}-Year DCF Projection</p>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-blue-400" />
            <span className="text-slate-500">FCF</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-emerald-400" />
            <span className="text-slate-500">Present Value</span>
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="fcfGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="pvGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={v => `$${formatValue(v)}`}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '3 3' }} />
          <Area
            type="monotone"
            dataKey="fcf"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#fcfGradient)"
            dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
            activeDot={{ r: 6, fill: '#3b82f6', stroke: '#1e3a5f', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="pv_fcf"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="url(#pvGradient)"
            dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#10b981', stroke: '#064e3b', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
