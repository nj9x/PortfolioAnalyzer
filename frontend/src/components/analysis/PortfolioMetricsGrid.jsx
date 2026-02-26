import { Activity, TrendingDown, ShieldAlert, BarChart3 } from 'lucide-react'
import clsx from 'clsx'

function MetricCard({ icon: Icon, iconColor, label, value, unit, interpretation, interpretColor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={clsx('p-1.5 rounded-lg', iconColor)}>
          <Icon size={14} className="text-white" />
        </div>
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-gray-900 tabular-nums">{value ?? '—'}</span>
        {unit && <span className="text-xs text-gray-400">{unit}</span>}
      </div>
      {interpretation && (
        <p className={clsx('text-[11px] font-medium', interpretColor || 'text-gray-500')}>
          {interpretation}
        </p>
      )}
    </div>
  )
}

export default function PortfolioMetricsGrid({ riskMetrics, portfolioBeta }) {
  if (!riskMetrics) return null

  const { sharpe, max_drawdown, var_95 } = riskMetrics

  // Sharpe interpretation color
  const sharpeColor = sharpe?.value > 1 ? 'text-green-600'
    : sharpe?.value > 0.5 ? 'text-blue-600'
    : sharpe?.value > 0 ? 'text-yellow-600'
    : 'text-red-600'

  // Max drawdown severity color
  const ddColor = max_drawdown?.value_pct > -10 ? 'text-green-600'
    : max_drawdown?.value_pct > -20 ? 'text-yellow-600'
    : 'text-red-600'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Beta */}
      <MetricCard
        icon={Activity}
        iconColor="bg-blue-500"
        label="Portfolio Beta"
        value={portfolioBeta?.value}
        interpretation={portfolioBeta?.interpretation}
        interpretColor="text-blue-600"
      />

      {/* Sharpe Ratio */}
      <MetricCard
        icon={BarChart3}
        iconColor="bg-indigo-500"
        label="Sharpe Ratio"
        value={sharpe?.value}
        interpretation={sharpe?.interpretation}
        interpretColor={sharpeColor}
      />

      {/* Max Drawdown */}
      <MetricCard
        icon={TrendingDown}
        iconColor="bg-red-500"
        label="Max Drawdown"
        value={max_drawdown?.value_pct != null ? `${max_drawdown.value_pct}` : null}
        unit="%"
        interpretation={
          max_drawdown?.peak_date && max_drawdown?.trough_date
            ? `${max_drawdown.peak_date} → ${max_drawdown.trough_date}`
            : null
        }
        interpretColor={ddColor}
      />

      {/* VaR */}
      <MetricCard
        icon={ShieldAlert}
        iconColor="bg-orange-500"
        label="VaR (95%, 1-day)"
        value={var_95?.dollar != null ? `$${var_95.dollar.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : null}
        interpretation={var_95?.pct != null ? `${var_95.pct.toFixed(2)}% of portfolio` : null}
        interpretColor="text-orange-600"
      />
    </div>
  )
}
