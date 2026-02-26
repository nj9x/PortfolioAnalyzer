import { DollarSign, Briefcase, AlertTriangle, TrendingUp } from 'lucide-react'

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
    <div className="flex items-center gap-4 bg-white rounded-lg border border-gray-200 px-4 py-2 text-sm">
      <div className="flex items-center gap-1.5">
        <DollarSign size={14} className="text-green-600" />
        <span className="text-gray-500">AUM</span>
        <span className="font-bold text-gray-900">{formatCurrency(totalAUM)}</span>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <Briefcase size={14} className="text-blue-600" />
        <span className="text-gray-500">Portfolios</span>
        <span className="font-bold text-gray-900">{portfolioCount || 0}</span>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <TrendingUp size={14} className="text-emerald-600" />
        <span className="text-gray-500">Entry Points</span>
        <span className="font-bold text-emerald-700">{alertSummary?.entry_point || 0}</span>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-amber-600" />
        <span className="text-gray-500">Alerts</span>
        <span className="font-bold text-gray-900">{totalAlerts}</span>
        {alertSummary?.trim_opportunity > 0 && (
          <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">
            {alertSummary.trim_opportunity} trim
          </span>
        )}
        {alertSummary?.review_needed > 0 && (
          <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">
            {alertSummary.review_needed} review
          </span>
        )}
      </div>
    </div>
  )
}
