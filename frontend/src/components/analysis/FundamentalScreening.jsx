import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react'
import clsx from 'clsx'

const flagBadge = (flag) => {
  const configs = {
    UNDERVALUED_OPPORTUNITY: { color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle, label: 'Undervalued' },
    OVERVALUATION_WARNING: { color: 'bg-red-100 text-red-800 border-red-300', icon: AlertTriangle, label: 'Overvalued' },
    FAIRLY_VALUED: { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: HelpCircle, label: 'Fair Value' },
  }
  const cfg = configs[flag] || configs.FAIRLY_VALUED
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md border', cfg.color)}>
      <Icon size={12} /> {cfg.label}
    </span>
  )
}

function MetricItem({ label, value, suffix = '', good, bad }) {
  if (value == null) return (
    <div className="flex justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-400">N/A</span>
    </div>
  )

  let color = 'text-gray-900'
  if (good && value >= good) color = 'text-green-700'
  if (bad && value >= bad) color = 'text-red-700'

  return (
    <div className="flex justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={clsx('text-xs font-mono font-medium', color)}>
        {typeof value === 'number' ? value.toFixed(2) : value}{suffix}
      </span>
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

  const { valuation, quality, growth, health, valuation_flag, flag_reasoning } = data

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">{ticker}</h4>
        {flagBadge(valuation_flag)}
      </div>

      {flag_reasoning && (
        <p className="text-xs text-gray-600 italic">{flag_reasoning}</p>
      )}

      {/* Valuation */}
      <div>
        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valuation</h5>
        <div className="divide-y divide-gray-100">
          <MetricItem label="P/E Ratio" value={valuation?.pe_ratio} />
          <MetricItem label="Forward P/E" value={valuation?.forward_pe} />
          <MetricItem label="EV/EBIT" value={valuation?.ev_ebit} good={null} bad={25} />
          <MetricItem label="Earnings Yield" value={valuation?.earnings_yield} suffix="%" good={8} />
          <MetricItem label="FCF Yield" value={valuation?.fcf_yield} suffix="%" good={8} />
          <MetricItem label="P/B Ratio" value={valuation?.price_to_book} />
        </div>
      </div>

      {/* Quality */}
      <div>
        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Quality</h5>
        <div className="divide-y divide-gray-100">
          <MetricItem label="ROIC" value={quality?.roic} suffix="%" good={20} />
          <MetricItem label="ROE" value={quality?.roe} suffix="%" good={15} />
          <MetricItem label="Profit Margin" value={quality?.profit_margin} suffix="%" good={15} />
        </div>
      </div>

      {/* Growth */}
      <div>
        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Growth</h5>
        <div className="divide-y divide-gray-100">
          <MetricItem label="Revenue Growth" value={growth?.revenue_growth} suffix="%" good={10} />
          <MetricItem label="Earnings Growth" value={growth?.earnings_growth} suffix="%" good={15} />
          <MetricItem label="Qtr Earnings" value={growth?.earnings_quarterly_growth} suffix="%" />
        </div>
      </div>

      {/* Financial Health */}
      <div>
        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Health</h5>
        <div className="divide-y divide-gray-100">
          <MetricItem label="Debt/Equity" value={health?.debt_to_equity} bad={2.0} />
          <MetricItem label="Current Ratio" value={health?.current_ratio} good={1.5} />
          <MetricItem label="Quick Ratio" value={health?.quick_ratio} good={1.0} />
        </div>
      </div>
    </div>
  )
}

export default function FundamentalScreening({ data, aiCommentary }) {
  const fundamentals = data?.fundamentals || {}
  const tickers = Object.keys(fundamentals)

  if (tickers.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <DollarSign size={32} className="mx-auto mb-2 text-gray-300" />
        <p>No fundamental data available. Run an analysis first.</p>
      </div>
    )
  }

  // Summary counts
  const flags = tickers.map(t => fundamentals[t]?.valuation_flag)
  const undervalued = flags.filter(f => f === 'UNDERVALUED_OPPORTUNITY').length
  const overvalued = flags.filter(f => f === 'OVERVALUATION_WARNING').length
  const fair = flags.filter(f => f === 'FAIRLY_VALUED').length

  return (
    <div className="space-y-6">
      {/* AI Commentary */}
      {aiCommentary?.commentary && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-purple-900 mb-2">AI Fundamental Analysis</h3>
          <p className="text-sm text-purple-800 leading-relaxed whitespace-pre-line">
            {aiCommentary.commentary}
          </p>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 bg-white rounded-lg border border-gray-200 p-4">
        <span className="text-sm text-gray-600">Screening Results:</span>
        {undervalued > 0 && (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <TrendingUp size={14} /> {undervalued} Undervalued
          </span>
        )}
        {fair > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-600">
            <HelpCircle size={14} /> {fair} Fair Value
          </span>
        )}
        {overvalued > 0 && (
          <span className="flex items-center gap-1 text-xs text-red-700">
            <TrendingDown size={14} /> {overvalued} Overvalued
          </span>
        )}
      </div>

      {/* Ticker Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tickers.map(ticker => (
          <TickerCard key={ticker} ticker={ticker} data={fundamentals[ticker]} />
        ))}
      </div>
    </div>
  )
}
