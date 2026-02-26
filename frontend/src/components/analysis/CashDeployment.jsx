import { Wallet, TrendingUp } from 'lucide-react'

export default function CashDeployment({ cash }) {
  if (!cash) return null

  const { cash_balance, total_invested, total_assets, deployment_rate_pct } = cash
  const deploymentColor = deployment_rate_pct >= 90 ? 'text-green-600'
    : deployment_rate_pct >= 70 ? 'text-blue-600'
    : deployment_rate_pct >= 50 ? 'text-yellow-600'
    : 'text-orange-600'

  const barColor = deployment_rate_pct >= 90 ? 'bg-green-500'
    : deployment_rate_pct >= 70 ? 'bg-blue-500'
    : deployment_rate_pct >= 50 ? 'bg-yellow-500'
    : 'bg-orange-500'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-lg bg-green-50">
          <Wallet size={14} className="text-green-600" />
        </div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Cash & Deployment
        </h3>
      </div>

      {/* Deployment rate */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Deployment Rate</span>
          <span className={`text-lg font-bold tabular-nums ${deploymentColor}`}>
            {deployment_rate_pct.toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(deployment_rate_pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-2.5 pt-3 border-t border-gray-100">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Cash Balance</span>
          <span className="text-sm font-semibold text-gray-800 tabular-nums">
            ${cash_balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Invested</span>
          <span className="text-sm font-semibold text-gray-800 tabular-nums">
            ${total_invested.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Total Assets</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">
            ${total_assets.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  )
}
