import { Gauge, ArrowUpDown, BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'

const signalColors = {
  IV_ELEVATED: 'bg-red-100 text-red-800 border-red-300',
  IV_DEPRESSED: 'bg-green-100 text-green-800 border-green-300',
  IV_NORMAL: 'bg-gray-100 text-gray-700 border-gray-300',
  'N/A': 'bg-gray-100 text-gray-500 border-gray-200',
}

function IvHvBar({ iv, hv }) {
  if (iv == null || hv == null) return <span className="text-xs text-gray-400">Insufficient data</span>
  const max = Math.max(iv, hv, 0.01)
  const ivPct = (iv / max) * 100
  const hvPct = (hv / max) * 100

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 w-6">IV</span>
        <div className="flex-1 h-3 bg-gray-100 rounded">
          <div className="h-full bg-blue-500 rounded" style={{ width: `${ivPct}%` }} />
        </div>
        <span className="text-xs font-mono w-14 text-right">{(iv * 100).toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 w-6">HV</span>
        <div className="flex-1 h-3 bg-gray-100 rounded">
          <div className="h-full bg-orange-500 rounded" style={{ width: `${hvPct}%` }} />
        </div>
        <span className="text-xs font-mono w-14 text-right">{(hv * 100).toFixed(1)}%</span>
      </div>
    </div>
  )
}

function GreekRow({ label, value }) {
  if (value == null) return null
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-mono text-gray-800">{value}</span>
    </div>
  )
}

function TickerCard({ ticker, data }) {
  if (!data.has_options) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-900">{ticker}</h4>
        <p className="text-xs text-gray-400 mt-1">
          {data.error || 'No options data available for this ticker.'}
        </p>
      </div>
    )
  }

  const { expiration, days_to_expiry, atm_strike, call = {}, put = {}, volatility = {} } = data
  const signal = volatility.signal || 'N/A'
  const opportunity = volatility.opportunity || ''

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">{ticker}</h4>
          <p className="text-[11px] text-gray-500">
            Exp: {expiration} ({days_to_expiry}d) | Strike: ${atm_strike}
          </p>
        </div>
        <span className={clsx('text-xs font-semibold px-2 py-1 rounded-md border', signalColors[signal])}>
          {signal.replace('_', ' ')}
        </span>
      </div>

      {/* IV vs HV comparison */}
      <div>
        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">IV vs HV</h5>
        <IvHvBar iv={volatility.iv_avg} hv={volatility.hv_30d} />
        {volatility.iv_hv_ratio != null && (
          <p className="text-[11px] text-gray-500 mt-1">IV/HV Ratio: {volatility.iv_hv_ratio}</p>
        )}
      </div>

      {/* Strategy Signal */}
      {opportunity && (
        <div className={clsx('text-xs rounded px-3 py-2 border', signalColors[signal])}>
          {opportunity}
        </div>
      )}

      {/* Call & Put Greeks side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <h5 className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
            <TrendingUp size={11} /> Call
          </h5>
          <div className="bg-green-50 rounded p-2 divide-y divide-green-100">
            <GreekRow label="Price" value={call.last_price != null ? `$${call.last_price}` : null} />
            <GreekRow label="Bid/Ask" value={call.bid != null ? `$${call.bid} / $${call.ask}` : null} />
            <GreekRow label="IV" value={call.implied_volatility != null ? `${(call.implied_volatility * 100).toFixed(1)}%` : null} />
            <GreekRow label="Delta" value={call.delta} />
            <GreekRow label="Gamma" value={call.gamma} />
            <GreekRow label="Theta" value={call.theta} />
            <GreekRow label="Vega" value={call.vega} />
            <GreekRow label="OI" value={call.open_interest?.toLocaleString()} />
            <GreekRow label="Vol" value={call.volume?.toLocaleString()} />
          </div>
        </div>
        <div>
          <h5 className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
            <TrendingDown size={11} /> Put
          </h5>
          <div className="bg-red-50 rounded p-2 divide-y divide-red-100">
            <GreekRow label="Price" value={put.last_price != null ? `$${put.last_price}` : null} />
            <GreekRow label="Bid/Ask" value={put.bid != null ? `$${put.bid} / $${put.ask}` : null} />
            <GreekRow label="IV" value={put.implied_volatility != null ? `${(put.implied_volatility * 100).toFixed(1)}%` : null} />
            <GreekRow label="Delta" value={put.delta} />
            <GreekRow label="Gamma" value={put.gamma} />
            <GreekRow label="Theta" value={put.theta} />
            <GreekRow label="Vega" value={put.vega} />
            <GreekRow label="OI" value={put.open_interest?.toLocaleString()} />
            <GreekRow label="Vol" value={put.volume?.toLocaleString()} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OptionsMonitor({ data, aiCommentary }) {
  const options = data?.options || {}
  const tickers = Object.keys(options)

  if (tickers.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Gauge size={32} className="mx-auto mb-2 text-gray-300" />
        <p>No options data available. Run an analysis first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* AI Commentary */}
      {aiCommentary?.commentary && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-teal-900 mb-2">AI Options Analysis</h3>
          <p className="text-sm text-teal-800 leading-relaxed whitespace-pre-line">
            {aiCommentary.commentary}
          </p>
        </div>
      )}

      {/* Ticker Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tickers.map(ticker => (
          <TickerCard key={ticker} ticker={ticker} data={options[ticker]} />
        ))}
      </div>
    </div>
  )
}
