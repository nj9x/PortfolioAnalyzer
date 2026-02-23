import clsx from 'clsx'

const ACTION_STYLES = {
  BUY: 'bg-green-100 text-green-800',
  INCREASE: 'bg-green-50 text-green-700',
  HOLD: 'bg-gray-100 text-gray-800',
  REDUCE: 'bg-orange-100 text-orange-800',
  SELL: 'bg-red-100 text-red-800',
}

const CONFIDENCE_DOTS = {
  high: 'text-green-500',
  medium: 'text-yellow-500',
  low: 'text-red-500',
}

export default function RecommendationCard({ rec }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900 text-lg">{rec.ticker}</span>
        <span
          className={clsx(
            'px-2.5 py-0.5 rounded-full text-xs font-semibold',
            ACTION_STYLES[rec.action] || 'bg-gray-100 text-gray-700'
          )}
        >
          {rec.action}
        </span>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{rec.reasoning}</p>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        {rec.confidence && (
          <span className="flex items-center gap-1">
            <span className={clsx('text-lg leading-none', CONFIDENCE_DOTS[rec.confidence])}>
              &bull;
            </span>
            {rec.confidence} confidence
          </span>
        )}
        {rec.target_price && <span>Target: ${rec.target_price.toFixed(2)}</span>}
        {rec.time_horizon && <span>{rec.time_horizon}</span>}
      </div>
    </div>
  )
}
