import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'

function TickerLogo({ ticker, fallbackText }) {
  const [failed, setFailed] = useState(false)
  const logoUrl = `/api/v1/market-data/logo?ticker=${ticker}`

  if (failed) {
    return (
      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-sm font-bold text-white">
        {fallbackText}
      </div>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={ticker}
      className="w-10 h-10 rounded-xl object-contain bg-white/20 backdrop-blur-sm p-1"
      onError={() => setFailed(true)}
    />
  )
}

// Colorful card palette — each holding gets a unique gradient
const CARD_THEMES = [
  { from: '#7c3aed', to: '#5b21b6', name: 'violet' },     // purple
  { from: '#2563eb', to: '#1d4ed8', name: 'blue' },        // blue
  { from: '#0d9488', to: '#0f766e', name: 'teal' },        // teal
  { from: '#c026d3', to: '#a21caf', name: 'fuchsia' },     // fuchsia
  { from: '#059669', to: '#047857', name: 'emerald' },      // emerald
  { from: '#dc2626', to: '#b91c1c', name: 'red' },          // red
  { from: '#ea580c', to: '#c2410c', name: 'orange' },       // orange
  { from: '#4f46e5', to: '#4338ca', name: 'indigo' },       // indigo
  { from: '#0891b2', to: '#0e7490', name: 'cyan' },         // cyan
  { from: '#d97706', to: '#b45309', name: 'amber' },        // amber
  { from: '#e11d48', to: '#be123c', name: 'rose' },         // rose
  { from: '#65a30d', to: '#4d7c0f', name: 'lime' },         // lime
  { from: '#7c2d12', to: '#6c2710', name: 'brown' },        // brown
]

function MiniChart({ data, theme }) {
  if (!data || data.length < 2) {
    return <div className="w-full h-full opacity-20 rounded" />
  }

  const gradientId = `card-spark-${theme.name}-${Math.random().toString(36).slice(2, 7)}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="close"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function HoldingScrollCard({ ticker, data, sparkData, index = 0 }) {
  const theme = CARD_THEMES[index % CARD_THEMES.length]
  const changePct = data?.day_change_pct
  const isUp = changePct > 0
  const isDown = changePct < 0

  return (
    <Link to={`/stock/${ticker}`} className="block shrink-0">
      <div
        className="relative rounded-2xl p-4 w-[180px] h-[200px] flex flex-col justify-between overflow-hidden hover:scale-[1.03] transition-transform cursor-pointer shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)`,
        }}
      >
        {/* Sparkline background */}
        <div className="absolute bottom-0 left-0 right-0 h-[80px] opacity-60">
          <MiniChart data={sparkData} theme={theme} />
        </div>

        {/* Top: Icon + Ticker */}
        <div>
          <div className="mb-2">
            <TickerLogo ticker={ticker} fallbackText={ticker.slice(0, 2)} />
          </div>
          <p className="text-white font-bold text-sm">{ticker}</p>
          <p className="text-white/60 text-[11px] truncate">{data?.name || ticker}</p>
        </div>

        {/* Bottom: Price + Change */}
        <div className="relative z-10">
          <p className="text-white text-xl font-bold tabular-nums">
            ${data?.current_price?.toFixed(2) ?? '—'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {isUp && <TrendingUp size={12} className="text-green-300" />}
            {isDown && <TrendingDown size={12} className="text-red-300" />}
            <span
              className={
                isUp ? 'text-green-300 text-xs font-semibold' :
                isDown ? 'text-red-300 text-xs font-semibold' :
                'text-white/60 text-xs font-semibold'
              }
            >
              {changePct != null
                ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
