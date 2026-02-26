import { useState } from 'react'
import { TrendingUp, Scissors, AlertTriangle, ChevronDown, ChevronUp, Bell } from 'lucide-react'
import clsx from 'clsx'

const ALERT_CONFIG = {
  entry_point: {
    label: 'Good Entry Points',
    icon: TrendingUp,
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
    iconColor: 'text-emerald-600',
    description: 'Bullish technicals + undervalued fundamentals',
  },
  trim_opportunity: {
    label: 'Consider Trimming',
    icon: Scissors,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    iconColor: 'text-amber-600',
    description: 'Stocks up >10% from cost basis',
  },
  review_needed: {
    label: 'Review Needed',
    icon: AlertTriangle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    iconColor: 'text-red-600',
    description: 'Stocks down >15% from cost basis',
  },
}

export default function AlertsPanel({ alerts }) {
  const [expanded, setExpanded] = useState(true)

  if (!alerts || alerts.length === 0) return null

  // Group alerts by type
  const grouped = {}
  for (const a of alerts) {
    if (!grouped[a.alert_type]) grouped[a.alert_type] = []
    grouped[a.alert_type].push(a)
  }

  // Order: entry_point, trim_opportunity, review_needed
  const orderedTypes = ['entry_point', 'trim_opportunity', 'review_needed']
    .filter(t => grouped[t]?.length > 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-gray-600" />
          <span className="text-sm font-semibold text-gray-900">Alerts & Opportunities</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {alerts.length}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {/* Alert groups */}
      {expanded && (
        <div className="px-5 pb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {orderedTypes.map((type) => {
            const config = ALERT_CONFIG[type]
            const items = grouped[type]
            const Icon = config.icon

            return (
              <div key={type} className={`rounded-lg border ${config.border} ${config.bg} p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={config.iconColor} />
                  <span className={`text-xs font-bold ${config.iconColor}`}>{config.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config.badge}`}>
                    {items.length}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{config.description}</p>
                <div className="space-y-1.5">
                  {items.map((a, i) => (
                    <div key={i} className="bg-white/80 rounded-lg px-2.5 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-gray-800">{a.ticker}</span>
                        {a.gain_loss_pct != null && (
                          <span className={clsx(
                            'font-semibold tabular-nums',
                            a.gain_loss_pct > 0 ? 'text-green-600' :
                            a.gain_loss_pct < 0 ? 'text-red-600' : 'text-gray-500'
                          )}>
                            {a.gain_loss_pct >= 0 ? '+' : ''}{a.gain_loss_pct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      {a.portfolioName && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {a.clientName ? `${a.clientName} — ` : ''}{a.portfolioName}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
