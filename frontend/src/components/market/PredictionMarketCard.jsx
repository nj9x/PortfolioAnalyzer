import clsx from 'clsx'

export default function PredictionMarketCard({ event }) {
  const prob = event.probability

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{event.title}</p>
      {prob != null ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">Probability</span>
            <span
              className={clsx(
                'font-semibold',
                prob >= 70 ? 'text-green-600' : prob >= 40 ? 'text-yellow-600' : 'text-red-600'
              )}
            >
              {prob}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={clsx(
                'h-2 rounded-full',
                prob >= 70 ? 'bg-green-500' : prob >= 40 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${prob}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 mt-2">No price data</p>
      )}
    </div>
  )
}
