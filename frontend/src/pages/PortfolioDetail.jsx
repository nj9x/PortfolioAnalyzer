import { useParams, Link } from 'react-router-dom'
import { useEffect } from 'react'
import { usePortfolioContext } from '../context/PortfolioContext'
import { usePortfolio } from '../hooks/usePortfolios'
import { useQuotes, useNews } from '../hooks/useMarketData'
import { useLatestAnalysis } from '../hooks/useAnalysis'
import PortfolioSummary from '../components/portfolio/PortfolioSummary'
import StockListItem from '../components/market/StockListItem'
import NewsCard from '../components/market/NewsCard'
import RiskAssessment from '../components/analysis/RiskAssessment'
import RecommendationCard from '../components/analysis/RecommendationCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import EmptyState from '../components/common/EmptyState'
import { ArrowLeft, Briefcase, FileText, BarChart3, Calculator } from 'lucide-react'

export default function PortfolioDetail() {
  const { id } = useParams()
  const portfolioId = Number(id)
  const { setSelectedPortfolioId } = usePortfolioContext()

  // Keep context in sync so other pages (Analysis, etc.) work with this portfolio
  useEffect(() => {
    if (portfolioId) setSelectedPortfolioId(portfolioId)
  }, [portfolioId, setSelectedPortfolioId])

  const { data: portfolio } = usePortfolio(portfolioId)
  const { data: quotesData, isLoading: quotesLoading, error: quotesError } = useQuotes(portfolioId)
  const { data: newsData } = useNews(portfolioId)
  const { data: analysis } = useLatestAnalysis(portfolioId)

  if (!portfolioId) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Portfolio Not Found"
        description="This portfolio doesn't exist."
        action={
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Back to Dashboard
          </Link>
        }
      />
    )
  }

  const quotes = quotesData?.quotes || {}
  const articles = newsData?.articles || []
  const holdings = portfolio?.holdings || []

  return (
    <div className="space-y-6">
      {/* Back to Dashboard link + Portfolio name */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <span className="text-gray-300">|</span>
        <h2 className="text-xl font-semibold text-gray-900">{portfolio?.name || 'Portfolio'}</h2>
        {portfolio?.client_name && (
          <span className="text-sm text-gray-500">— {portfolio.client_name}</span>
        )}
        {portfolio?.category && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            portfolio.category === 'conservative' ? 'bg-blue-100 text-blue-700' :
            portfolio.category === 'high-growth' ? 'bg-purple-100 text-purple-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {portfolio.category === 'high-growth' ? 'High Growth' :
             portfolio.category.charAt(0).toUpperCase() + portfolio.category.slice(1)}
          </span>
        )}
      </div>

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

      {/* Stock cards grid */}
      {quotesLoading ? (
        <LoadingSpinner message="Loading market data..." />
      ) : (
        <div>
          <h3 className="font-medium text-gray-900 mb-3">Holdings</h3>
          {quotesError && (
            <ErrorBanner message={`Failed to load quotes: ${quotesError.response?.data?.detail || quotesError.message}`} />
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {holdings.map((h) => (
              <StockListItem
                key={h.ticker}
                ticker={h.ticker}
                data={quotes[h.ticker]}
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
