import { usePortfolioContext } from '../context/PortfolioContext'
import { useQuotes, useNews, usePredictions, useEconomicIndicators } from '../hooks/useMarketData'
import StockListItem from '../components/market/StockListItem'
import NewsCard from '../components/market/NewsCard'
import PredictionMarketCard from '../components/market/PredictionMarketCard'
import EconomicIndicator from '../components/market/EconomicIndicator'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import EmptyState from '../components/common/EmptyState'
import { Radio } from 'lucide-react'

export default function MarketSignals() {
  const { selectedPortfolioId } = usePortfolioContext()
  const { data: quotesData, isLoading: quotesLoading, error: quotesError } = useQuotes(selectedPortfolioId)
  const { data: newsData, isLoading: newsLoading } = useNews(selectedPortfolioId)
  const { data: predictionsData, isLoading: predsLoading } = usePredictions()
  const { data: economicData, isLoading: econLoading } = useEconomicIndicators()

  if (!selectedPortfolioId) {
    return (
      <EmptyState
        icon={Radio}
        title="Select a Portfolio"
        description="Choose a portfolio to see relevant market signals."
      />
    )
  }

  const quotes = quotesData?.quotes || {}
  const articles = newsData?.articles || []
  const predictions = predictionsData?.events || []
  const indicators = economicData?.indicators || {}

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-gray-900">Market Signals</h2>

      {/* Stock Quotes */}
      <section>
        <h3 className="font-medium text-gray-900 mb-3">Stock Quotes</h3>
        {quotesLoading ? (
          <LoadingSpinner message="Loading quotes..." />
        ) : (
          <>
            {quotesError && (
              <ErrorBanner message={`Failed to load quotes: ${quotesError.response?.data?.detail || quotesError.message}`} />
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Object.entries(quotes).map(([ticker, data]) => (
                <StockListItem
                  key={ticker}
                  ticker={ticker}
                  data={data}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Economic Indicators */}
      <section>
        <h3 className="font-medium text-gray-900 mb-3">Economic Indicators (FRED)</h3>
        {econLoading ? (
          <LoadingSpinner message="Loading indicators..." />
        ) : Object.keys(indicators).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(indicators).map(([id, data]) => (
              <EconomicIndicator key={id} name={data.name} value={data.value} date={data.date} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Configure FRED_API_KEY to see economic indicators</p>
        )}
      </section>

      {/* Prediction Markets */}
      <section>
        <h3 className="font-medium text-gray-900 mb-3">Prediction Markets (Polymarket)</h3>
        {predsLoading ? (
          <LoadingSpinner message="Loading predictions..." />
        ) : predictions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {predictions.slice(0, 12).map((event, i) => (
              <PredictionMarketCard key={event.id || i} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active prediction markets found</p>
        )}
      </section>

      {/* News */}
      <section>
        <h3 className="font-medium text-gray-900 mb-3">Financial News</h3>
        {newsLoading ? (
          <LoadingSpinner message="Loading news..." />
        ) : articles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {articles.map((a, i) => (
              <NewsCard key={i} article={a} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Configure NEWS_API_KEY to see financial news</p>
        )}
      </section>
    </div>
  )
}
