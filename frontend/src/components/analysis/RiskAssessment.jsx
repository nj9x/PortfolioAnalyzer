import clsx from 'clsx'
import { ShieldAlert, TrendingDown, AlertTriangle, Activity } from 'lucide-react'

function RiskGauge({ score }) {
  // Score from 1-10, render a semicircle gauge
  const pct = ((score ?? 0) / 10) * 100
  const color =
    score <= 3 ? '#22c55e' : score <= 5 ? '#eab308' : score <= 7 ? '#f97316' : '#ef4444'
  const label =
    score <= 3 ? 'Low' : score <= 5 ? 'Moderate' : score <= 7 ? 'High' : 'Very High'

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 shrink-0">
        <svg viewBox="0 0 80 80" className="w-full h-full">
          {/* Background circle */}
          <circle cx="40" cy="40" r="34" fill="none" stroke="#f3f4f6" strokeWidth="8" />
          {/* Score arc */}
          <circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${pct * 2.136} 999`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{score ?? '—'}</span>
          <span className="text-[9px] text-gray-400 uppercase">/10</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800">Risk Level</p>
        <p className="text-xs mt-0.5" style={{ color }}>{label} Risk</p>
      </div>
    </div>
  )
}

function DrawdownItem({ ticker, drawdown, current, fromHigh }) {
  const dd = drawdown ?? 0
  const severity = dd < -30 ? 'text-red-600 bg-red-50' : dd < -15 ? 'text-orange-600 bg-orange-50' : 'text-yellow-600 bg-yellow-50'

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <TrendingDown size={14} className="text-red-400" />
        <span className="text-xs font-semibold text-gray-800">{ticker}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-gray-400">${current?.toFixed(2)} / ${fromHigh?.toFixed(2)}</span>
        <span className={clsx('text-[11px] font-semibold px-1.5 py-0.5 rounded', severity)}>
          {dd.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function StopLossItem({ alert }) {
  const isBelowStop = alert.status === 'BELOW_STOP_LOSS'
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className={isBelowStop ? 'text-red-500' : 'text-yellow-500'} />
        <span className="text-xs font-semibold text-gray-800">{alert.ticker}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400">Stop: ${alert.stop_level}</span>
        <span className={clsx(
          'text-[11px] font-semibold px-1.5 py-0.5 rounded',
          isBelowStop ? 'text-red-600 bg-red-50' : 'text-yellow-600 bg-yellow-50'
        )}>
          {isBelowStop ? 'BELOW' : 'NEAR'}
        </span>
      </div>
    </div>
  )
}

export default function RiskAssessment({ score, outlook, riskData }) {
  const outlookColor =
    outlook === 'bullish'
      ? 'text-green-700 bg-green-50 border-green-200'
      : outlook === 'bearish'
        ? 'text-red-700 bg-red-50 border-red-200'
        : 'text-gray-700 bg-gray-50 border-gray-200'

  // Extract risk details
  const drawdowns = riskData?.drawdowns || {}
  const stopLossAlerts = riskData?.stop_loss_alerts || []
  const portfolioBeta = riskData?.portfolio_beta || {}

  // Sort drawdowns by worst first (exclude _worst meta key)
  const sortedDrawdowns = Object.entries(drawdowns)
    .filter(([key, val]) => key !== '_worst' && val.drawdown_pct != null && val.drawdown_pct < -5)
    .sort((a, b) => a[1].drawdown_pct - b[1].drawdown_pct)
    .slice(0, 5)

  const hasExposureData = sortedDrawdowns.length > 0 || stopLossAlerts.length > 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Risk Assessment</h3>
        {outlook && (
          <span className={clsx('px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize border', outlookColor)}>
            {outlook}
          </span>
        )}
      </div>

      {/* Gauge + Beta */}
      <div className="flex items-start justify-between mb-4">
        <RiskGauge score={score} />
        {portfolioBeta.value != null && (
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Activity size={14} className="text-blue-500" />
              <span className="text-sm font-bold text-gray-800">{portfolioBeta.value}</span>
            </div>
            <p className="text-[10px] text-gray-400 uppercase mt-0.5">Portfolio Beta</p>
            <p className="text-[10px] text-gray-500 mt-0.5 max-w-[140px] text-right">
              {portfolioBeta.interpretation}
            </p>
          </div>
        )}
      </div>

      {/* Exposed stocks */}
      {hasExposureData && (
        <div className="border-t border-gray-100 pt-3 mt-auto">
          {/* Drawdowns from high */}
          {sortedDrawdowns.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ShieldAlert size={13} className="text-red-400" />
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Most Exposed (from 52w high)
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {sortedDrawdowns.map(([ticker, dd]) => (
                  <DrawdownItem
                    key={ticker}
                    ticker={ticker}
                    drawdown={dd.drawdown_pct}
                    current={dd.current}
                    fromHigh={dd.from_high}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Stop loss alerts */}
          {stopLossAlerts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} className="text-yellow-500" />
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Stop-Loss Alerts
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {stopLossAlerts.map((a) => (
                  <StopLossItem key={a.ticker} alert={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
