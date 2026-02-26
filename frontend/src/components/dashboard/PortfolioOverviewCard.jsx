import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
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

  return (
    <div
      className={clsx(
        'bg-white rounded-lg border px-3 py-2.5 transition-all hover:shadow-sm cursor-pointer',
        is_underperforming ? 'border-red-200 bg-red-50/30' :
        alertCount > 0 ? 'border-amber-200' :
        'border-gray-200'
      )}
    >
      {/* Clickable header area */}
      <div onClick={onClick}>
        {/* Top row: name + badges + value */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <div className="min-w-0">
              {client_name && (
                <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{client_name}</p>
              )}
              <p className={clsx(
                'truncate leading-tight',
                client_name ? 'text-[11px] text-gray-500' : 'text-xs font-semibold text-gray-900'
              )}>
                {name}
              </p>
            </div>
            {/* Inline alert badges */}
            {is_underperforming && (
              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 shrink-0">
                <AlertTriangle size={8} /> Under
              </span>
            )}
            {entryAlerts.length > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                {entryAlerts.length} entry
              </span>
            )}
            {trimAlerts.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                {trimAlerts.length} trim
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900 tabular-nums leading-tight">{formatCurrency(total_value)}</p>
            <div className="flex items-center gap-1.5 justify-end">
              {total_return_pct != null && (
                <span className={clsx(
                  'text-[11px] font-semibold tabular-nums',
                  total_return_pct > 0 ? 'text-green-600' :
                  total_return_pct < 0 ? 'text-red-600' : 'text-gray-500'
                )}>
                  {total_return_pct >= 0 ? '+' : ''}{total_return_pct.toFixed(1)}%
                </span>
              )}
              {day_change_pct != null && (
                <span className={clsx(
                  'text-[10px] tabular-nums',
                  day_change_pct > 0 ? 'text-green-500' :
                  day_change_pct < 0 ? 'text-red-500' : 'text-gray-400'
                )}>
                  {day_change_pct >= 0 ? '+' : ''}{day_change_pct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expand/Collapse toggle */}
      {holdings?.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-600 transition-colors w-full justify-center pt-1.5 border-t border-gray-100"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Hide' : `${holdings_count} holdings`}
        </button>
      )}

      {/* Expanded holdings list */}
      {expanded && holdings?.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {holdings.map((h) => {
            const hasAlert = h.alerts?.length > 0
            return (
              <div
                key={h.ticker}
                className={clsx(
                  'flex items-center justify-between px-2 py-1 rounded text-[11px]',
                  hasAlert ? 'bg-amber-50/50' : 'bg-gray-50'
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-bold text-gray-800">{h.ticker}</span>
                  {h.alerts?.map((a, i) => (
                    <span key={i} className={clsx(
                      'px-1 py-0.5 rounded text-[9px] font-medium',
                      a.alert_type === 'trim_opportunity' ? 'bg-amber-100 text-amber-700' :
                      a.alert_type === 'entry_point' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {a.alert_type === 'trim_opportunity' ? 'TRIM' :
                       a.alert_type === 'entry_point' ? 'ADD' : 'REVIEW'}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
