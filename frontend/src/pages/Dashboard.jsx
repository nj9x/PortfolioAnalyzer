import { Link } from 'react-router-dom'
import { usePortfolioContext } from '../context/PortfolioContext'
import { usePortfolio, useDashboardOverview } from '../hooks/usePortfolios'
import { useQuotes, useSparklines, useNews, usePredictions, useEconomicIndicators, usePortfolioRisk } from '../hooks/useMarketData'
import { useLatestAnalysis } from '../hooks/useAnalysis'
import PortfolioSummary from '../components/portfolio/PortfolioSummary'
import HoldingScrollCard from '../components/market/HoldingScrollCard'
import TopBottomPerformers from '../components/dashboard/TopBottomPerformers'
import HoldingDetailChart from '../components/dashboard/HoldingDetailChart'
import NewsCard from '../components/market/NewsCard'
import PredictionMarketCard from '../components/market/PredictionMarketCard'
import EconomicIndicator from '../components/market/EconomicIndicator'
import RiskAssessment from '../components/analysis/RiskAssessment'
import AUMSummaryBar from '../components/analysis/AUMSummaryBar'
import RecommendationCard from '../components/analysis/RecommendationCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import EmptyState from '../components/common/EmptyState'
import { Briefcase, FileText, BarChart3, Calculator } from 'lucide-react'

export default function Dashboard() {
  const { selectedPortfolioId } = usePortfolioContext()
  const { data: portfolio } = usePortfolio(selectedPortfolioId)
  const { data: quotesData, isLoading: quotesLoading, error: quotesError } = useQuotes(selectedPortfolioId)
  const { data: sparklinesData } = useSparklines(selectedPortfolioId)
  const { data: newsData } = useNews(selectedPortfolioId)
  const { data: predictionsData, isLoading: predsLoading } = usePredictions()
  const { data: economicData, isLoading: econLoading } = useEconomicIndicators()
  const { data: analysis } = useLatestAnalysis(selectedPortfolioId)
  const { data: riskData } = usePortfolioRisk(selectedPortfolioId)
  const { data: overviewData } = useDashboardOverview()

  if (!selectedPortfolioId) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Select a Portfolio"
        description="Choose a portfolio from the dropdown above, or create one in the Portfolios page."
        action={
          <Link
            to="/portfolios"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Go to Portfolios
          </Link>
        }
      />
    )
  }

  const quotes = quotesData?.quotes || {}
  const sparklines = sparklinesData?.sparklines || {}
  const articles = newsData?.articles || []
  const predictions = predictionsData?.events || []
  const indicators = economicData?.indicators || {}
  const holdings = portfolio?.holdings || []

  return (
    <div className="space-y-6">
      {/* AUM Summary Bar */}
      <AUMSummaryBar overview={overviewData} />

      <h2 className="text-xl font-semibold text-gray-900">{portfolio?.name || 'Dashboard'}</h2>

      {/* Top row: Portfolio chart + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PortfolioSummary holdings={holdings} quotes={quotes} />
        {analysis ? (
          <RiskAssessment score={analysis.risk_score} outlook={analysis.market_outlook} riskData={riskData?.risk} />
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 mb-2">AI Analysis</h3>
            <p className="text-sm text-gray-500">
              No analysis yet.{' '}
              <Link to="/analysis" className="text-blue-600 hover:underline">
                Run one now
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Holdings — horizontal scroll strip */}
      {quotesLoading ? (
        <LoadingSpinner message="Loading market data..." />
      ) : holdings.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Holdings</h3>
          {quotesError && (
            <ErrorBanner message={`Failed to load quotes: ${quotesError.response?.data?.detail || quotesError.message}`} />
          )}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
            {holdings.map((h, i) => (
              <HoldingScrollCard
                key={h.ticker}
                ticker={h.ticker}
                data={quotes[h.ticker]}
                sparkData={sparklines[h.ticker]}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Top & Bottom Performers + Chart */}
      {!quotesLoading && holdings.length > 0 && Object.keys(quotes).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopBottomPerformers holdings={holdings} quotes={quotes} sparklines={sparklines} />
          <HoldingDetailChart holdings={holdings} quotes={quotes} />
        </div>
      )}

      {/* Latest recommendations */}
      {analysis?.recommendations?.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Latest Recommendations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.recommendations.slice(0, 4).map((rec) => (
              <RecommendationCard key={rec.id} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Economic Indicators */}
      {!econLoading && Object.keys(indicators).length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Economic Indicators</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(indicators).map(([id, data]) => (
              <EconomicIndicator key={id} name={data.name} value={data.value} date={data.date} />
            ))}
          </div>
        </div>
      )}

      {/* Prediction Markets */}
      {!predsLoading && predictions.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Prediction Markets (Polymarket)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {predictions.slice(0, 6).map((event, i) => (
              <PredictionMarketCard key={event.id || i} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Quick Tools */}
      <div>
        <h3 className="font-medium text-gray-900 mb-3">Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link to="/sec-filings" className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100"><FileText size={20} /></div>
            <div><p className="text-sm font-medium text-gray-900">SEC Filings</p><p className="text-xs text-gray-500">Browse EDGAR filings with AI search</p></div>
          </Link>
          <Link to="/chart-analysis" className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-100"><BarChart3 size={20} /></div>
            <div><p className="text-sm font-medium text-gray-900">Chart Analysis</p><p className="text-xs text-gray-500">AI-powered technical analysis</p></div>
          </Link>
          <Link to="/dcf" className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
            <div className="p-2 rounded-lg bg-green-50 text-green-600 group-hover:bg-green-100"><Calculator size={20} /></div>
            <div><p className="text-sm font-medium text-gray-900">DCF Valuation</p><p className="text-xs text-gray-500">Discounted cash flow calculator</p></div>
          </Link>
        </div>
      </div>

      {/* News */}
      {articles.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Recent News</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {articles.slice(0, 6).map((a, i) => (
              <NewsCard key={i} article={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
