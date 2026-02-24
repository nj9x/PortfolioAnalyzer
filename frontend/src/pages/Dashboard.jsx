import { usePortfolioContext } from '../context/PortfolioContext'
import { usePortfolio } from '../hooks/usePortfolios'
import { useQuotes, useNews, useSparklines } from '../hooks/useMarketData'
import { useLatestAnalysis } from '../hooks/useAnalysis'
import PortfolioSummary from '../components/portfolio/PortfolioSummary'
import StockListItem from '../components/market/StockListItem'
import NewsCard from '../components/market/NewsCard'
import RiskAssessment from '../components/analysis/RiskAssessment'
import RecommendationCard from '../components/analysis/RecommendationCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import EmptyState from '../components/common/EmptyState'
import { Briefcase } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { selectedPortfolioId } = usePortfolioContext()
  const { data: portfolio } = usePortfolio(selectedPortfolioId)
  const { data: quotesData, isLoading: quotesLoading, error: quotesError } = useQuotes(selectedPortfolioId)
  const { data: newsData } = useNews(selectedPortfolioId)
  const { data: analysis } = useLatestAnalysis(selectedPortfolioId)
  const { data: sparkData } = useSparklines(selectedPortfolioId)

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
  const articles = newsData?.articles || []
  const holdings = portfolio?.holdings || []
  const sparklines = sparkData?.sparklines || {}

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">{portfolio?.name || 'Dashboard'}</h2>

      {/* Top row: Portfolio chart + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PortfolioSummary holdings={holdings} quotes={quotes} />
        {analysis ? (
          <RiskAssessment score={analysis.risk_score} outlook={analysis.market_outlook} />
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

      {/* Stock watchlist */}
      {quotesLoading ? (
        <LoadingSpinner message="Loading market data..." />
      ) : (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Holdings</h3>
          {quotesError && (
            <ErrorBanner message={`Failed to load quotes: ${quotesError.response?.data?.detail || quotesError.message}`} />
          )}
          <div className="space-y-2">
            {holdings.map((h) => (
              <StockListItem
                key={h.ticker}
                ticker={h.ticker}
                data={quotes[h.ticker]}
                sparkline={sparklines[h.ticker]}
              />
            ))}
          </div>
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
