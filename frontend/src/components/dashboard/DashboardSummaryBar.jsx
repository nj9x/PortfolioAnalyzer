import { DollarSign, Briefcase, AlertTriangle, TrendingUp, ArrowDownCircle } from 'lucide-react'

function formatCurrency(val) {
  if (!val) return '$0'
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`
  return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function DashboardSummaryBar({ totalAUM, alertSummary, portfolioCount }) {
  const totalAlerts = (alertSummary?.trim_opportunity || 0) +
    (alertSummary?.entry_point || 0) +
    (alertSummary?.review_needed || 0)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total AUM */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={16} className="text-green-600" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total AUM</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAUM)}</p>
      </div>

      {/* Portfolios */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={16} className="text-blue-600" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Portfolios</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">{portfolioCount || 0}</p>
      </div>

      {/* Entry Points */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={16} className="text-emerald-600" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Entry Points</span>
        </div>
        <p className="text-2xl font-bold text-emerald-700">{alertSummary?.entry_point || 0}</p>
      </div>

      {/* Active Alerts */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-amber-600" />
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Alerts</span>
        </div>
        <div className="flex items-end gap-3">
          <p className="text-2xl font-bold text-gray-900">{totalAlerts}</p>
          {(alertSummary?.trim_opportunity > 0 || alertSummary?.review_needed > 0) && (
            <div className="flex gap-2 mb-1">
              {alertSummary?.trim_opportunity > 0 && (
                <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {alertSummary.trim_opportunity} trim
                </span>
              )}
              {alertSummary?.review_needed > 0 && (
                <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">
                  {alertSummary.review_needed} review
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
