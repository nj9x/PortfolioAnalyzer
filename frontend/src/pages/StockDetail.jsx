import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { ArrowLeft, CheckCircle, AlertTriangle, HelpCircle, Activity, BarChart3, Target, Shield } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import clsx from 'clsx'
import { useTickerQuote, useTickerFundamentals, useTickerTechnicals, useTickerHistory, useTickerRisk } from '../hooks/useMarketData'
import LoadingSpinner from '../components/common/LoadingSpinner'

// ─── Helpers ────────────────────────────────────────────────────────

function formatMarketCap(val) {
  if (!val) return 'N/A'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  return `$${val.toLocaleString()}`
}

function MetricItem({ label, value, suffix = '', good, bad }) {
  if (value == null) return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-400">N/A</span>
    </div>
  )
  let color = 'text-gray-900'
  if (good && value >= good) color = 'text-green-700'
  if (bad && value >= bad) color = 'text-red-700'
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={clsx('text-sm font-mono font-medium', color)}>
        {typeof value === 'number' ? value.toFixed(2) : value}{suffix}
      </span>
    </div>
  )
}

function RsiBar({ value }) {
  if (value == null) return <span className="text-sm text-gray-400">N/A</span>
  const pct = Math.min(Math.max(value, 0), 100)
  const color = value > 70 ? 'bg-red-500' : value < 30 ? 'bg-green-500' : 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 bg-gray-200 rounded-full relative">
        <div className="absolute left-[30%] top-0 bottom-0 w-px bg-gray-400 opacity-40" />
        <div className="absolute left-[70%] top-0 bottom-0 w-px bg-gray-400 opacity-40" />
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-mono w-8 text-right">{value}</span>
    </div>
  )
}

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

// ─── Risk Metric Card ───────────────────────────────────────────────

function RiskMetricCard({ label, value, suffix = '', interpretation, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx('text-2xl font-bold font-mono', color || 'text-gray-900')}>
        {value != null ? `${value}${suffix}` : 'N/A'}
      </p>
      {interpretation && (
        <p className="text-xs text-gray-500 mt-1">{interpretation}</p>
      )}
    </div>
  )
}

// ─── Monte Carlo Tooltip ────────────────────────────────────────────

function MonteCarloTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-lg p-3 shadow-xl text-sm">
      <p className="font-semibold text-slate-200 mb-1">{d.date}</p>
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-red-400">95th %ile</span>
          <span className="text-slate-200 font-mono">${d.p95?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-orange-400">75th %ile</span>
          <span className="text-slate-200 font-mono">${d.p75?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-blue-400">Median</span>
          <span className="text-white font-mono font-semibold">${d.p50?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-orange-400">25th %ile</span>
          <span className="text-slate-200 font-mono">${d.p25?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-400">5th %ile</span>
          <span className="text-slate-200 font-mono">${d.p5?.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Price Chart Tooltip ────────────────────────────────────────────

function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-lg p-3 shadow-xl text-sm">
      <p className="font-semibold text-slate-200 mb-1">{d.date}</p>
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Open</span>
          <span className="text-slate-200 font-mono">${d.open?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">High</span>
          <span className="text-slate-200 font-mono">${d.high?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Low</span>
          <span className="text-slate-200 font-mono">${d.low?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Close</span>
          <span className="text-white font-mono font-semibold">${d.close?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Volume</span>
          <span className="text-slate-200 font-mono">{d.volume?.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Period Selector ────────────────────────────────────────────────

const PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
]

// ─── Main Page ──────────────────────────────────────────────────────

export default function StockDetail() {
  const { ticker: rawTicker } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('1y')

  const ticker = rawTicker?.toUpperCase()

  const { data: quoteData, isLoading: quoteLoading } = useTickerQuote(ticker)
  const { data: fundData } = useTickerFundamentals(ticker)
  const { data: techData } = useTickerTechnicals(ticker)
  const { data: historyData, isLoading: histLoading } = useTickerHistory(ticker, period)
  const { data: riskData, isLoading: riskLoading } = useTickerRisk(ticker)

  const quote = quoteData?.quotes?.[ticker] || {}
  const fundamentals = fundData?.fundamentals?.[ticker] || {}
  const technicals = techData?.technicals?.[ticker] || {}
  const bars = historyData?.bars || []
  const risk = riskData?.risk || {}
  const monteCarlo = risk.monte_carlo || {}

  const monteCarloChartData = useMemo(() => {
    if (!monteCarlo.dates || !monteCarlo.bands) return []
    return monteCarlo.dates.map((date, i) => ({
      date,
      p5: monteCarlo.bands.p5?.[i],
      p25: monteCarlo.bands.p25?.[i],
      p50: monteCarlo.bands.p50?.[i],
      p75: monteCarlo.bands.p75?.[i],
      p95: monteCarlo.bands.p95?.[i],
      // Stacked deltas for Recharts band rendering
      base: monteCarlo.bands.p5?.[i],
      outerLower: (monteCarlo.bands.p25?.[i] || 0) - (monteCarlo.bands.p5?.[i] || 0),
      innerLower: (monteCarlo.bands.p50?.[i] || 0) - (monteCarlo.bands.p25?.[i] || 0),
      innerUpper: (monteCarlo.bands.p75?.[i] || 0) - (monteCarlo.bands.p50?.[i] || 0),
      outerUpper: (monteCarlo.bands.p95?.[i] || 0) - (monteCarlo.bands.p75?.[i] || 0),
    }))
  }, [monteCarlo])

  const changePct = quote.day_change_pct
  const isUp = changePct > 0
  const isDown = changePct < 0

  // Chart color based on period performance
  const chartUp = bars.length >= 2 && bars[bars.length - 1]?.close >= bars[0]?.close
  const chartColor = chartUp ? '#22c55e' : '#ef4444'

  if (quoteLoading) {
    return <LoadingSpinner message={`Loading ${ticker}...`} />
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-600">
          {ticker?.slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{ticker}</h1>
            <span
              className={clsx(
                'text-sm font-semibold px-2.5 py-0.5 rounded-full',
                isUp && 'bg-green-50 text-green-700',
                isDown && 'bg-red-50 text-red-700',
                !isUp && !isDown && 'bg-gray-50 text-gray-500'
              )}
            >
              {changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
            </span>
          </div>
          <p className="text-sm text-gray-500 truncate">{quote.name || ticker}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            ${quote.current_price?.toFixed(2) ?? '—'}
          </p>
          <p className="text-sm text-gray-500">
            {quote.market_cap ? formatMarketCap(quote.market_cap) : ''}
          </p>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Price History</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={clsx(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  period === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {histLoading ? (
          <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Loading chart...</div>
        ) : bars.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={bars} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={(d) => {
                  const date = new Date(d)
                  return period === '1mo'
                    ? date.getDate().toString()
                    : date.toLocaleDateString('en-US', { month: 'short' })
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={(v) => `$${v}`}
                domain={['auto', 'auto']}
                width={60}
              />
              <Tooltip content={<PriceTooltip />} />
              <Area
                type="monotone"
                dataKey="close"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
                activeDot={{ r: 4, fill: chartColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">No chart data available</div>
        )}
      </div>

      {/* Fundamentals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Valuation */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valuation</h3>
            {fundamentals.valuation_flag && flagBadge(fundamentals.valuation_flag)}
          </div>
          {fundamentals.flag_reasoning && (
            <p className="text-xs text-gray-500 italic mb-2">{fundamentals.flag_reasoning}</p>
          )}
          <div className="divide-y divide-gray-100">
            <MetricItem label="P/E Ratio" value={fundamentals.valuation?.pe_ratio} />
            <MetricItem label="Forward P/E" value={fundamentals.valuation?.forward_pe} />
            <MetricItem label="EV/EBIT" value={fundamentals.valuation?.ev_ebit} bad={25} />
            <MetricItem label="Earnings Yield" value={fundamentals.valuation?.earnings_yield} suffix="%" good={8} />
            <MetricItem label="FCF Yield" value={fundamentals.valuation?.fcf_yield} suffix="%" good={8} />
            <MetricItem label="P/B Ratio" value={fundamentals.valuation?.price_to_book} />
          </div>
        </div>

        {/* Quality */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quality</h3>
          <div className="divide-y divide-gray-100">
            <MetricItem label="ROIC" value={fundamentals.quality?.roic} suffix="%" good={20} />
            <MetricItem label="ROE" value={fundamentals.quality?.roe} suffix="%" good={15} />
            <MetricItem label="Profit Margin" value={fundamentals.quality?.profit_margin} suffix="%" good={15} />
          </div>
        </div>

        {/* Growth */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Growth</h3>
          <div className="divide-y divide-gray-100">
            <MetricItem label="Revenue Growth" value={fundamentals.growth?.revenue_growth} suffix="%" good={10} />
            <MetricItem label="Earnings Growth" value={fundamentals.growth?.earnings_growth} suffix="%" good={15} />
            <MetricItem label="Quarterly Earnings" value={fundamentals.growth?.earnings_quarterly_growth} suffix="%" />
          </div>
        </div>

        {/* Financial Health */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financial Health</h3>
          <div className="divide-y divide-gray-100">
            <MetricItem label="Debt/Equity" value={fundamentals.health?.debt_to_equity} bad={2.0} />
            <MetricItem label="Current Ratio" value={fundamentals.health?.current_ratio} good={1.5} />
            <MetricItem label="Quick Ratio" value={fundamentals.health?.quick_ratio} good={1.0} />
          </div>
        </div>
      </div>

      {/* Risk Assessment */}
      {riskLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">
            Calculating risk metrics...
          </div>
        </div>
      ) : risk && !risk.error ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-gray-500" />
            <h2 className="font-semibold text-gray-900">Risk Assessment</h2>
            <span className="text-xs text-gray-400 ml-auto">
              Rf: {((risk.risk_free_rate || 0) * 100).toFixed(1)}% | Period: {risk.period}
            </span>
          </div>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RiskMetricCard
              label="Beta"
              value={risk.beta?.value}
              interpretation={risk.beta?.interpretation}
              color={
                risk.beta?.value > 1.3 ? 'text-red-600'
                  : risk.beta?.value < 0.7 ? 'text-blue-600'
                  : 'text-gray-900'
              }
            />
            <RiskMetricCard
              label="Jensen's Alpha"
              value={risk.alpha?.annualized_pct}
              suffix="%"
              interpretation={risk.alpha?.interpretation}
              color={
                risk.alpha?.annualized_pct > 0 ? 'text-green-600'
                  : risk.alpha?.annualized_pct < 0 ? 'text-red-600'
                  : 'text-gray-900'
              }
            />
            <RiskMetricCard
              label="Sharpe Ratio"
              value={risk.sharpe_ratio?.value}
              interpretation={risk.sharpe_ratio?.interpretation}
              color={
                risk.sharpe_ratio?.value > 1.0 ? 'text-green-600'
                  : risk.sharpe_ratio?.value > 0.5 ? 'text-blue-600'
                  : risk.sharpe_ratio?.value < 0 ? 'text-red-600'
                  : 'text-gray-900'
              }
            />
          </div>

          {/* Extra stats */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Annualized Return: <span className="font-mono font-medium text-gray-700">{risk.annualized_return}%</span></span>
            <span>Annualized Volatility: <span className="font-mono font-medium text-gray-700">{risk.annualized_volatility}%</span></span>
          </div>

          {/* Monte Carlo Fan Chart */}
          {monteCarloChartData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Monte Carlo Simulation — 6 Month Projection
                </h3>
                <span className="text-xs text-gray-400">
                  {monteCarlo.num_simulations?.toLocaleString()} paths | Start: ${monteCarlo.start_price}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={monteCarloChartData} stackOffset="none" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickFormatter={(d) => {
                      const date = new Date(d)
                      return date.toLocaleDateString('en-US', { month: 'short' })
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                    domain={['auto', 'auto']}
                    width={65}
                  />
                  <Tooltip content={<MonteCarloTooltip />} />
                  <Area dataKey="base" stackId="mc" stroke="none" fill="transparent" />
                  <Area dataKey="outerLower" stackId="mc" stroke="none" fill="#fecaca" fillOpacity={0.4} />
                  <Area dataKey="innerLower" stackId="mc" stroke="none" fill="#bfdbfe" fillOpacity={0.5} />
                  <Area dataKey="innerUpper" stackId="mc" stroke="none" fill="#bfdbfe" fillOpacity={0.5} />
                  <Area dataKey="outerUpper" stackId="mc" stroke="none" fill="#fecaca" fillOpacity={0.4} />
                  <Area dataKey="p50" stroke="#3b82f6" strokeWidth={2} fill="none" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> 5th–95th %ile
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-300" /> 25th–75th %ile
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-1 bg-blue-500 rounded" /> Median
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Technical Indicators */}
      {technicals && !technicals.error && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Technical Indicators</h3>
            {technicals.overall_signal && signalBadge(technicals.overall_signal)}
          </div>

          {/* RSI */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <Activity size={14} /> RSI(14)
              </span>
              {signalBadge(technicals.rsi?.signal)}
            </div>
            <RsiBar value={technicals.rsi?.value} />
          </div>

          {/* MACD */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <BarChart3 size={14} /> MACD
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-gray-600">
                H: {technicals.macd?.histogram ?? 'N/A'}
              </span>
              {signalBadge(technicals.macd?.signal)}
            </div>
          </div>

          {/* Bollinger */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Bollinger Bands</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-gray-600">
                Pos: {technicals.bollinger?.position ?? 'N/A'}
              </span>
              {technicals.bollinger?.squeeze && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">SQUEEZE</span>
              )}
              {signalBadge(technicals.bollinger?.signal)}
            </div>
          </div>

          {/* Moving Averages */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Moving Averages</span>
              {signalBadge(technicals.moving_averages?.price_vs_sma200)}
            </div>
            <div className="text-xs font-mono text-gray-600">
              SMA 20: {technicals.moving_averages?.sma_20 ?? '—'}
              {' | '}50: {technicals.moving_averages?.sma_50 ?? '—'}
              {' | '}200: {technicals.moving_averages?.sma_200 ?? '—'}
            </div>
            {technicals.moving_averages?.golden_cross && (
              <p className="text-xs text-green-600 font-semibold">Golden Cross detected</p>
            )}
            {technicals.moving_averages?.death_cross && (
              <p className="text-xs text-red-600 font-semibold">Death Cross detected</p>
            )}
          </div>

          {/* Support / Resistance */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-1">
              <Target size={14} /> Support / Resistance
            </span>
            <span className="font-mono text-gray-600 text-xs">
              S: ${technicals.support_resistance?.nearest_support ?? '—'}
              {' | '}
              R: ${technicals.support_resistance?.nearest_resistance ?? '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
