import { TrendingUp, TrendingDown, Minus, Activity, BarChart3, Target } from 'lucide-react'
import clsx from 'clsx'

const signalBadge = (signal) => {
  const colors = {
    BULLISH: 'bg-green-100 text-green-800',
    BEARISH: 'bg-red-100 text-red-800',
    OVERBOUGHT: 'bg-orange-100 text-orange-800',
    OVERSOLD: 'bg-blue-100 text-blue-800',
    NEUTRAL: 'bg-gray-100 text-gray-700',
    HIGH: 'bg-orange-100 text-orange-800',
    LOW: 'bg-blue-100 text-blue-800',
    NORMAL: 'bg-gray-100 text-gray-700',
    ABOVE: 'bg-green-100 text-green-800',
    BELOW: 'bg-red-100 text-red-800',
  }
  return (
    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full', colors[signal] || 'bg-gray-100 text-gray-700')}>
      {signal || 'N/A'}
    </span>
  )
}

const SignalIcon = ({ signal }) => {
  if (signal === 'BULLISH' || signal === 'OVERSOLD') return <TrendingUp size={14} className="text-green-600" />
  if (signal === 'BEARISH' || signal === 'OVERBOUGHT') return <TrendingDown size={14} className="text-red-600" />
  return <Minus size={14} className="text-gray-400" />
}

function RsiBar({ value }) {
  if (value == null) return <span className="text-xs text-gray-400">N/A</span>
  const pct = Math.min(Math.max(value, 0), 100)
  const color = value > 70 ? 'bg-red-500' : value < 30 ? 'bg-green-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full relative">
        <div className="absolute left-[30%] top-0 bottom-0 w-px bg-gray-400 opacity-40" />
        <div className="absolute left-[70%] top-0 bottom-0 w-px bg-gray-400 opacity-40" />
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value}</span>
    </div>
  )
}

function TickerCard({ ticker, data }) {
  if (data.error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-900">{ticker}</h4>
        <p className="text-sm text-red-500 mt-1">{data.error}</p>
      </div>
    )
  }

  const { rsi, macd, bollinger, moving_averages: mas, support_resistance: sr, volume, overall_signal } = data

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-900">{ticker}</h4>
          <SignalIcon signal={overall_signal} />
        </div>
        {signalBadge(overall_signal)}
      </div>

      {/* RSI */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Activity size={12} /> RSI(14)
          </span>
          {signalBadge(rsi?.signal)}
        </div>
        <RsiBar value={rsi?.value} />
      </div>

      {/* MACD */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <BarChart3 size={12} /> MACD
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-600">
            H: {macd?.histogram ?? 'N/A'}
          </span>
          {signalBadge(macd?.signal)}
        </div>
      </div>

      {/* Bollinger */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Bollinger</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-600">
            Pos: {bollinger?.position ?? 'N/A'}
          </span>
          {bollinger?.squeeze && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">SQUEEZE</span>
          )}
          {signalBadge(bollinger?.signal)}
        </div>
      </div>

      {/* Moving Averages */}
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex justify-between">
          <span>SMAs</span>
          <span className="font-mono">
            20: {mas?.sma_20 ?? '-'} | 50: {mas?.sma_50 ?? '-'} | 200: {mas?.sma_200 ?? '-'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>vs SMA200</span>
          {signalBadge(mas?.price_vs_sma200)}
        </div>
        {mas?.golden_cross && (
          <div className="text-green-600 font-semibold">✦ Golden Cross detected</div>
        )}
        {mas?.death_cross && (
          <div className="text-red-600 font-semibold">✦ Death Cross detected</div>
        )}
      </div>

      {/* Support / Resistance */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 flex items-center gap-1">
          <Target size={12} /> S/R
        </span>
        <span className="font-mono text-gray-600">
          S: ${sr?.nearest_support ?? '-'} ({sr?.support_distance_pct ?? '-'}%)
          {' | '}
          R: ${sr?.nearest_resistance ?? '-'} (+{sr?.resistance_distance_pct ?? '-'}%)
        </span>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Volume</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-gray-600">{volume?.ratio ?? '-'}x avg</span>
          {signalBadge(volume?.signal)}
        </div>
      </div>
    </div>
  )
}

export default function TechnicalDashboard({ data, aiCommentary }) {
  const technicals = data?.technicals || {}
  const tickers = Object.keys(technicals)

  if (tickers.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Activity size={32} className="mx-auto mb-2 text-gray-300" />
        <p>No technical data available. Run an analysis first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* AI Commentary */}
      {aiCommentary?.commentary && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">AI Technical Analysis</h3>
          <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">
            {aiCommentary.commentary}
          </p>
        </div>
      )}

      {/* Ticker Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tickers.map(ticker => (
          <TickerCard key={ticker} ticker={ticker} data={technicals[ticker]} />
        ))}
      </div>
    </div>
  )
}
