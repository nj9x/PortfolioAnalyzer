import { TrendingUp, TrendingDown, DollarSign, Briefcase, AlertTriangle } from 'lucide-react'

function MetricPill({ label, value, isPositive, prefix = '', suffix = '' }) {
  return (
    <div className="flex flex-col items-center px-4 py-2">
      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</span>
      <span className={`text-sm font-bold tabular-nums mt-0.5 ${isPositive === true ? 'text-green-600' : isPositive === false ? 'text-red-600' : 'text-gray-900'}`}>
        {prefix}{value}{suffix}
      </span>
    </div>
  )
}

export default function AUMSummaryBar({ overview }) {
  if (!overview) return null

  const {
    total_aum = 0,
    total_daily_pnl_dollar = 0,
    total_daily_pnl_pct = 0,
    portfolio_count = 0,
    alert_summary = {},
  } = overview

  const totalAlerts = Object.values(alert_summary).reduce((a, b) => a + b, 0)
  const isUp = total_daily_pnl_dollar >= 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* AUM */}
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 rounded-lg bg-blue-50">
            <DollarSign size={18} className="text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Total AUM</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">
              ${total_aum.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-gray-200 hidden sm:block" />

        {/* Daily P&L */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: isUp ? '#f0fdf4' : '#fef2f2' }}>
          {isUp ? <TrendingUp size={16} className="text-green-600" /> : <TrendingDown size={16} className="text-red-600" />}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Daily P&L</p>
            <p className={`text-sm font-bold tabular-nums ${isUp ? 'text-green-600' : 'text-red-600'}`}>
              {isUp ? '+' : ''}${total_daily_pnl_dollar.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-semibold ml-1">
                ({isUp ? '+' : ''}{total_daily_pnl_pct.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-10 w-px bg-gray-200 hidden sm:block" />

        {/* Portfolio count */}
        <div className="flex items-center gap-2 px-3">
          <Briefcase size={14} className="text-gray-400" />
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Portfolios</p>
            <p className="text-sm font-bold text-gray-900">{portfolio_count}</p>
          </div>
        </div>

        {/* Alerts */}
        {totalAlerts > 0 && (
          <>
            <div className="h-10 w-px bg-gray-200 hidden sm:block" />
            <div className="flex items-center gap-3 px-3">
              <AlertTriangle size={14} className="text-orange-500" />
              <div className="flex gap-2">
                {alert_summary.entry_point > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                    {alert_summary.entry_point} Entry
                  </span>
                )}
                {alert_summary.trim_opportunity > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">
                    {alert_summary.trim_opportunity} Trim
                  </span>
                )}
                {alert_summary.review_needed > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                    {alert_summary.review_needed} Review
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
