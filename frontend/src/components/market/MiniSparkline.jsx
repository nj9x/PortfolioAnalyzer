import { AreaChart, Area, ResponsiveContainer } from 'recharts'

export default function MiniSparkline({ data, width = 80, height = 32 }) {
  if (!data || data.length < 2) {
    return (
      <div
        className="bg-gray-50 rounded"
        style={{ width, height }}
      />
    )
  }

  const first = data[0].close
  const last = data[data.length - 1].close
  const isUp = last >= first

  const color = isUp ? '#22c55e' : '#ef4444' // green-500 / red-500
  const gradientId = `spark-${isUp ? 'up' : 'down'}-${Math.random().toString(36).slice(2, 7)}`

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 1, right: 0, left: 0, bottom: 1 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
