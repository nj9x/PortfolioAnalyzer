import { TrendingUp, TrendingDown, Minus, Target, Shield, DollarSign, Percent } from 'lucide-react'
import clsx from 'clsx'

const verdictConfig = {
  UNDERVALUED: {
    label: 'Undervalued',
    gradient: 'from-emerald-600/20 to-emerald-900/10',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    accent: 'text-emerald-400',
    icon: TrendingUp,
    glow: 'shadow-emerald-500/5',
  },
  OVERVALUED: {
    label: 'Overvalued',
    gradient: 'from-red-600/20 to-red-900/10',
    border: 'border-red-500/30',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    accent: 'text-red-400',
    icon: TrendingDown,
    glow: 'shadow-red-500/5',
  },
  FAIR_VALUE: {
    label: 'Fair Value',
    gradient: 'from-amber-600/20 to-amber-900/10',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    accent: 'text-amber-400',
    icon: Minus,
    glow: 'shadow-amber-500/5',
  },
}

function fmt(val) {
  if (val == null) return '—'
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function MetricBox({ label, value, icon: Icon, accent = false }) {
  return (
    <div className="bg-slate-800/40 rounded-lg px-3.5 py-2.5 border border-slate-700/30">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon size={11} className="text-slate-500" />}
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={clsx('text-sm font-semibold', accent || 'text-slate-200')}>{value}</p>
    </div>
  )
}

export default function ValuationSummaryCard({ result }) {
  if (!result) return null

  const v = verdictConfig[result.valuation_verdict] || verdictConfig.FAIR_VALUE
  const VerdictIcon = v.icon

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden shadow-lg',
      v.border, v.glow
    )}>
      {/* Top gradient bar */}
      <div className={clsx('bg-gradient-to-r p-5', v.gradient)}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Intrinsic Value per Share</p>
            <p className="text-4xl font-bold text-white mt-1 tracking-tight">
              ${result.intrinsic_value_per_share?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <span className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border',
            v.badge
          )}>
            <VerdictIcon size={13} />
            {v.label}
          </span>
        </div>

        {/* Upside/downside bar */}
        {result.current_price != null && result.upside_downside_pct != null && (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1 bg-slate-800/60 rounded-full h-2 overflow-hidden">
              {result.upside_downside_pct >= 0 ? (
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(Math.abs(result.upside_downside_pct), 100)}%` }}
                />
              ) : (
                <div className="h-full flex justify-end">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all"
                    style={{ width: `${Math.min(Math.abs(result.upside_downside_pct), 100)}%` }}
                  />
                </div>
              )}
            </div>
            <span className={clsx('text-sm font-bold min-w-[60px] text-right',
              result.upside_downside_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {result.upside_downside_pct >= 0 ? '+' : ''}{result.upside_downside_pct}%
            </span>
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="bg-slate-900/60 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {result.current_price != null && (
            <MetricBox label="Current Price" value={`$${result.current_price.toFixed(2)}`} icon={DollarSign} />
          )}
          {result.margin_of_safety != null && (
            <MetricBox
              label="Margin of Safety"
              value={`${result.margin_of_safety}%`}
              icon={Shield}
              accent={result.margin_of_safety > 0 ? 'text-emerald-400' : 'text-red-400'}
            />
          )}
          <MetricBox label="Enterprise Value" value={fmt(result.enterprise_value)} icon={Target} />
          <MetricBox label="Discount Rate" value={`${(result.discount_rate * 100).toFixed(2)}%`} icon={Percent} />
        </div>

        <div className="grid grid-cols-3 gap-2.5 mt-2.5">
          <MetricBox label="Equity Value" value={fmt(result.equity_value)} />
          <MetricBox label="Terminal Value" value={fmt(result.terminal_value)} />
          <MetricBox
            label="Terminal Value %"
            value={result.enterprise_value > 0
              ? `${((result.terminal_value / ((1 + result.discount_rate) ** result.projection_years)) / result.enterprise_value * 100).toFixed(1)}%`
              : '—'}
          />
        </div>
      </div>
    </div>
  )
}
