import { useParams, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { usePortfolioContext } from '../context/PortfolioContext'
import { usePortfolio, usePortfolioAnalytics } from '../hooks/usePortfolios'
import { useQuotes, useSparklines, useNews, usePortfolioRisk } from '../hooks/useMarketData'
import { useLatestAnalysis } from '../hooks/useAnalysis'
import HoldingTickerStrip from '../components/portfolio/HoldingTickerStrip'
import PortfolioValueHero from '../components/portfolio/PortfolioValueHero'
import PortfolioSnapshot from '../components/portfolio/PortfolioSnapshot'
import RiskAssessment from '../components/analysis/RiskAssessment'
import PnLSummary from '../components/analysis/PnLSummary'
import PortfolioMetricsGrid from '../components/analysis/PortfolioMetricsGrid'
import BenchmarkComparison from '../components/analysis/BenchmarkComparison'
import AssetAllocationBreakdown from '../components/analysis/AssetAllocationBreakdown'
import PerformanceAttribution from '../components/analysis/PerformanceAttribution'
import DriftAlerts from '../components/analysis/DriftAlerts'
import CashDeployment from '../components/analysis/CashDeployment'
import RecommendationCard from '../components/analysis/RecommendationCard'
import NewsCard from '../components/market/NewsCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import { ArrowLeft, Briefcase, Shield, Scale, Rocket, FileText, BarChart3, Calculator } from 'lucide-react'

const CATEGORY_CONFIG = {
  conservative: { label: 'Conservative', icon: Shield, class: 'bg-blue-100 text-blue-700' },
  balanced: { label: 'Balanced', icon: Scale, class: 'bg-gray-100 text-gray-700' },
  'high-growth': { label: 'High Growth', icon: Rocket, class: 'bg-purple-100 text-purple-700' },
}

export default function PortfolioDetail() {
  const { id } = useParams()
  const portfolioId = Number(id)
  const { setSelectedPortfolioId } = usePortfolioContext()

  useEffect(() => {
    if (portfolioId) setSelectedPortfolioId(portfolioId)
  }, [portfolioId, setSelectedPortfolioId])

  const { data: portfolio } = usePortfolio(portfolioId)
  const { data: quotesData, isLoading: quotesLoading } = useQuotes(portfolioId)
  const { data: sparklinesData } = useSparklines(portfolioId)
  const { data: newsData } = useNews(portfolioId)
  const { data: analysis } = useLatestAnalysis(portfolioId)
  const { data: riskData } = usePortfolioRisk(portfolioId)
  const { data: analytics, isLoading: analyticsLoading } = usePortfolioAnalytics(portfolioId)

  if (!portfolioId) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Portfolio Not Found"
        description="This portfolio doesn't exist."
        action={
          <Link to="/" className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
            Back to Dashboard
          </Link>
        }
      />
    )
  }

  const quotes = quotesData?.quotes || {}
  const sparklines = sparklinesData?.sparklines || {}
  const articles = newsData?.articles || []
  const holdings = portfolio?.holdings || []
  const cat = CATEGORY_CONFIG[portfolio?.category] || CATEGORY_CONFIG.balanced
  const CatIcon = cat.icon

  if (quotesLoading && !portfolio) return <LoadingSpinner message="Loading portfolio..." />

  return (
    <div className="space-y-4 min-w-0 overflow-hidden">
      {/* Header: back link + portfolio info */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-2 min-w-0">
          {portfolio?.client_name && (
            <h2 className="text-lg font-bold text-gray-900 truncate">{portfolio.client_name}</h2>
          )}
          <span className={portfolio?.client_name ? 'text-sm text-gray-500' : 'text-lg font-bold text-gray-900'}>
            {portfolio?.name || 'Portfolio'}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${cat.class}`}>
            <CatIcon size={10} />
            {cat.label}
          </span>
        </div>
      </div>

      {/* Ticker strip — horizontal scroll of holdings */}
      <HoldingTickerStrip holdings={holdings} quotes={quotes} sparklines={sparklines} />

      {/* P&L Summary strip */}
      {analytics?.pnl && <PnLSummary pnl={analytics.pnl} />}

      {/* Main content: Value Hero + Risk Assessment side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PortfolioValueHero holdings={holdings} quotes={quotes} />
        </div>
        <div>
          {analysis ? (
            <RiskAssessment score={analysis.risk_score} outlook={analysis.market_outlook} riskData={riskData?.risk} />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-full flex flex-col justify-center">
              <h3 className="font-medium text-gray-900 mb-1 text-sm">AI Analysis</h3>
              <p className="text-xs text-gray-500">
                No analysis yet.{' '}
                <Link to="/analysis" className="text-blue-600 hover:underline">Run one now</Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Metrics Grid: Sharpe, Max Drawdown, VaR */}
      {analytics?.risk_metrics && (
        <PortfolioMetricsGrid
          riskMetrics={analytics.risk_metrics}
          portfolioBeta={riskData?.risk?.portfolio_beta}
        />
      )}

      {/* Benchmark Comparison Chart */}
      {analytics?.benchmark?.dates?.length > 0 && (
        <BenchmarkComparison benchmark={analytics.benchmark} />
      )}

      {/* Asset Allocation + Performance Attribution side by side */}
      {(analytics?.asset_allocation || analytics?.attribution?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AssetAllocationBreakdown allocation={analytics.asset_allocation} />
          <PerformanceAttribution attributions={analytics.attribution} />
        </div>
      )}

      {/* Drift Alerts + Cash Deployment (conditional) */}
      {(analytics?.drift?.has_target || analytics?.cash?.cash_balance > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {analytics?.drift?.has_target && <DriftAlerts drift={analytics.drift} />}
          {analytics?.cash && <CashDeployment cash={analytics.cash} />}
        </div>
      )}

      {/* Holdings table with sparklines */}
      <PortfolioSnapshot holdings={holdings} quotes={quotes} sparklines={sparklines} />

      {/* Recommendations */}
      {analysis?.recommendations?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Recommendations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.recommendations.slice(0, 4).map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Tools + News side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tools */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Quick Tools</h3>
          <Link to="/sec-filings" className="flex items-center gap-2.5 bg-white rounded-lg border border-gray-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100"><FileText size={16} /></div>
            <div><p className="text-xs font-medium text-gray-900">SEC Filings</p><p className="text-[10px] text-gray-500">Browse EDGAR filings</p></div>
          </Link>
          <Link to="/chart-analysis" className="flex items-center gap-2.5 bg-white rounded-lg border border-gray-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-100"><BarChart3 size={16} /></div>
            <div><p className="text-xs font-medium text-gray-900">Chart Analysis</p><p className="text-[10px] text-gray-500">AI technical analysis</p></div>
          </Link>
          <Link to="/dcf" className="flex items-center gap-2.5 bg-white rounded-lg border border-gray-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
            <div className="p-1.5 rounded-lg bg-green-50 text-green-600 group-hover:bg-green-100"><Calculator size={16} /></div>
            <div><p className="text-xs font-medium text-gray-900">DCF Valuation</p><p className="text-[10px] text-gray-500">Cash flow calculator</p></div>
          </Link>
        </div>

        {/* News */}
        {articles.length > 0 && (
          <div className="lg:col-span-2 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Recent News</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {articles.slice(0, 4).map((a, i) => (
                <NewsCard key={i} article={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
