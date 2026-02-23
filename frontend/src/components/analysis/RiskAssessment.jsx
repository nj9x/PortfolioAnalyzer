import clsx from 'clsx'

export default function RiskAssessment({ score, outlook }) {
  const riskColor =
    score <= 3 ? 'text-green-600' : score <= 6 ? 'text-yellow-600' : 'text-red-600'
  const riskBg =
    score <= 3 ? 'bg-green-500' : score <= 6 ? 'bg-yellow-500' : 'bg-red-500'
  const outlookColor =
    outlook === 'bullish'
      ? 'text-green-700 bg-green-50'
      : outlook === 'bearish'
        ? 'text-red-700 bg-red-50'
        : 'text-gray-700 bg-gray-50'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="font-medium text-gray-900 mb-4">Risk Assessment</h3>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className={clsx('text-4xl font-bold', riskColor)}>{score ?? '-'}</p>
          <p className="text-xs text-gray-500 mt-1">Risk Score (1-10)</p>
        </div>
        <div className="flex-1">
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className={clsx('h-3 rounded-full transition-all', riskBg)}
              style={{ width: `${((score ?? 0) / 10) * 100}%` }}
            />
          </div>
        </div>
        {outlook && (
          <span className={clsx('px-3 py-1 rounded-full text-sm font-medium capitalize', outlookColor)}>
            {outlook}
          </span>
        )}
      </div>
    </div>
  )
}
