import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Scissors, Search } from 'lucide-react'
import clsx from 'clsx'

function formatCurrency(val) {
  if (!val) return '$0'
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
  return `$${val.toFixed(2)}`
}

export default function PortfolioOverviewCard({ portfolio, onClick }) {
  const [expanded, setExpanded] = useState(false)

  const {
    name, client_name, total_value, total_return_pct, day_change_pct,
    is_underperforming, holdings, alerts, holdings_count,
  } = portfolio

  const alertCount = alerts?.length || 0
  const trimAlerts = alerts?.filter(a => a.alert_type === 'trim_opportunity') || []
  const entryAlerts = alerts?.filter(a => a.alert_type === 'entry_point') || []
  const reviewAlerts = alerts?.filter(a => a.alert_type === 'review_needed') || []

  return (
    <div
      className={clsx(
        'bg-white rounded-xl border p-4 transition-all hover:shadow-md cursor-pointer',
        is_underperforming ? 'border-red-200 bg-red-50/30' :
        alertCount > 0 ? 'border-amber-200' :
        'border-gray-200'
      )}
    >
      {/* Clickable header area */}
      <div onClick={onClick} className="space-y-2">
        {/* Client + Portfolio name */}
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            {client_name && (
              <p className="text-sm font-semibold text-gray-900 truncate">{client_name}</p>
            )}
            <p className={clsx(
              'truncate',
              client_name ? 'text-xs text-gray-500' : 'text-sm font-semibold text-gray-900'
            )}>
              {name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {is_underperforming && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <AlertTriangle size={10} /> Under
              </span>
            )}
            {entryAlerts.length > 0 && (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                {entryAlerts.length} entry
              </span>
            )}
            {trimAlerts.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                {trimAlerts.length} trim
              </span>
            )}
          </div>
        </div>

        {/* Value + Return */}
        <div className="flex items-end justify-between">
          <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(total_value)}</p>
          <div className="text-right">
            {total_return_pct != null && (
              <p className={clsx(
                'text-sm font-semibold tabular-nums',
                total_return_pct > 0 ? 'text-green-600' :
                total_return_pct < 0 ? 'text-red-600' : 'text-gray-500'
              )}>
                {total_return_pct >= 0 ? '+' : ''}{total_return_pct.toFixed(1)}%
              </p>
            )}
            {day_change_pct != null && (
              <p className={clsx(
                'text-xs tabular-nums',
                day_change_pct > 0 ? 'text-green-500' :
                day_change_pct < 0 ? 'text-red-500' : 'text-gray-400'
              )}>
                Today: {day_change_pct >= 0 ? '+' : ''}{day_change_pct.toFixed(2)}%
              </p>
            )}
          </div>
        </div>

        {/* Holdings count */}
        <p className="text-xs text-gray-400">{holdings_count} holdings</p>
      </div>

      {/* Expand/Collapse toggle */}
      {holdings?.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors w-full justify-center pt-2 border-t border-gray-100"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Hide Holdings' : 'Show Holdings'}
        </button>
      )}

      {/* Expanded holdings list */}
      {expanded && holdings?.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {holdings.map((h) => {
            const hasAlert = h.alerts?.length > 0
            return (
              <div
                key={h.ticker}
                className={clsx(
                  'flex items-center justify-between px-2 py-1.5 rounded-lg text-xs',
                  hasAlert ? 'bg-amber-50/50' : 'bg-gray-50'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-gray-800">{h.ticker}</span>
                  <span className="text-gray-400">{h.shares} shares</span>
                  {h.alerts?.map((a, i) => (
                    <span key={i} className={clsx(
                      'px-1 py-0.5 rounded text-[10px] font-medium',
                      a.alert_type === 'trim_opportunity' ? 'bg-amber-100 text-amber-700' :
                      a.alert_type === 'entry_point' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {a.alert_type === 'trim_opportunity' ? 'TRIM' :
                       a.alert_type === 'entry_point' ? 'ADD' : 'REVIEW'}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {h.current_price && (
                    <span className="text-gray-600 tabular-nums">${h.current_price.toFixed(2)}</span>
                  )}
                  {h.gain_loss_pct != null && (
                    <span className={clsx(
                      'font-semibold tabular-nums',
                      h.gain_loss_pct > 0 ? 'text-green-600' :
                      h.gain_loss_pct < 0 ? 'text-red-600' : 'text-gray-500'
                    )}>
                      {h.gain_loss_pct >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
