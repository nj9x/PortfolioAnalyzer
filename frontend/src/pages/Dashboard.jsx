import { useNavigate, Link } from 'react-router-dom'
import { useDashboardOverview } from '../hooks/usePortfolios'
import DashboardSummaryBar from '../components/dashboard/DashboardSummaryBar'
import PortfolioCategoryColumn from '../components/dashboard/PortfolioCategoryColumn'
import AlertsPanel from '../components/dashboard/AlertsPanel'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import EmptyState from '../components/common/EmptyState'
import { LayoutDashboard, Plus } from 'lucide-react'

export default function Dashboard() {
  const { data, isLoading, error } = useDashboardOverview()
  const navigate = useNavigate()

  if (isLoading) return <LoadingSpinner message="Loading portfolios..." />
  if (error) return <ErrorBanner message="Failed to load dashboard data" />

  const { portfolios = [], total_aum = 0, alert_summary = {} } = data || {}

  if (portfolios.length === 0) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Welcome to Portfolio Analyzer"
        description="Create your first client portfolio to get started. Assign a category (Conservative, Balanced, or High Growth) and add holdings to see performance at a glance."
        action={
          <Link
            to="/portfolios"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Create Portfolio
          </Link>
        }
      />
    )
  }

  // Group portfolios by category
  const conservative = portfolios.filter(p => p.category === 'conservative')
  const balanced = portfolios.filter(p => p.category === 'balanced')
  const highGrowth = portfolios.filter(p => p.category === 'high-growth')

  // Collect all alerts with portfolio context
  const allAlerts = portfolios.flatMap(p =>
    (p.alerts || []).map(a => ({
      ...a,
      portfolioName: p.name,
      clientName: p.client_name,
    }))
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <LayoutDashboard size={22} className="text-blue-600" />
          Advisor Dashboard
        </h2>
        <Link
          to="/portfolios"
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> New Portfolio
        </Link>
      </div>

      {/* Summary Bar */}
      <DashboardSummaryBar
        totalAUM={total_aum}
        alertSummary={alert_summary}
        portfolioCount={portfolios.length}
      />

      {/* Alerts Panel */}
      {allAlerts.length > 0 && <AlertsPanel alerts={allAlerts} />}

      {/* Category Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PortfolioCategoryColumn
          category="conservative"
          portfolios={conservative}
          onSelectPortfolio={(id) => navigate(`/portfolio/${id}`)}
        />
        <PortfolioCategoryColumn
          category="balanced"
          portfolios={balanced}
          onSelectPortfolio={(id) => navigate(`/portfolio/${id}`)}
        />
        <PortfolioCategoryColumn
          category="high-growth"
          portfolios={highGrowth}
          onSelectPortfolio={(id) => navigate(`/portfolio/${id}`)}
        />
      </div>
    </div>
  )
}
