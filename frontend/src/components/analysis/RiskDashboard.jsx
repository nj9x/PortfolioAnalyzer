import { Shield, AlertTriangle, PieChart, Link2, TrendingDown, Crosshair } from 'lucide-react'
import clsx from 'clsx'

function BetaCard({ beta }) {
  if (!beta) return null
  const value = beta.value ?? 1.0
  const interp = beta.interpretation || ''
  const individual = beta.individual || {}

  let color = 'text-gray-900'
  if (value > 1.2) color = 'text-red-700'
  else if (value < 0.8) color = 'text-green-700'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={16} className="text-blue-600" />
        <h4 className="font-semibold text-gray-900">Portfolio Beta</h4>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={clsx('text-3xl font-bold', color)}>{value}</span>
        <span className="text-sm text-gray-500">vs market</span>
      </div>
      <p className="text-xs text-gray-600 mb-3">{interp}</p>
      {Object.keys(individual).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(individual).map(([t, b]) => (
            <span key={t} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">
              {t}: {b}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SectorCard({ sectors }) {
  if (!sectors?.sectors) return null
  const data = sectors.sectors
  const warnings = sectors.warnings || []
  const entries = Object.entries(data)
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <PieChart size={16} className="text-purple-600" />
        <h4 className="font-semibold text-gray-900">Sector Concentration</h4>
      </div>
      <div className="space-y-2">
        {entries.map(([sector, pct]) => (
          <div key={sector}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-gray-700">{sector}</span>
              <span className="font-mono text-gray-600">{pct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full">
              <div
                className={clsx('h-full rounded-full', pct > 40 ? 'bg-red-500' : pct > 25 ? 'bg-yellow-500' : 'bg-blue-500')}
                style={{ width: `${(pct / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1 text-xs text-orange-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PositionSizingCard({ sizing }) {
  if (!sizing) return null
  const { alerts = [], max_position, position_count } = sizing

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair size={16} className="text-orange-600" />
        <h4 className="font-semibold text-gray-900">Position Sizing</h4>
      </div>
      <div className="flex gap-6 text-sm mb-3">
        <div>
          <span className="text-gray-500">Positions:</span>{' '}
          <span className="font-semibold">{position_count}</span>
        </div>
        {max_position?.ticker && (
          <div>
            <span className="text-gray-500">Largest:</span>{' '}
            <span className="font-semibold">{max_position.ticker}</span>{' '}
            <span className="text-gray-600">({max_position.weight_pct}%)</span>
          </div>
        )}
      </div>
      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded px-3 py-2">
              <span className="text-xs font-semibold text-orange-800">{a.ticker}</span>
              <span className="text-xs text-orange-700">{a.weight_pct}% — {a.alert}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-green-600">All positions within acceptable limits.</p>
      )}
    </div>
  )
}

function CorrelationCard({ correlation }) {
  if (!correlation) return null
  const { high_pairs = [], avg_correlation } = correlation

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={16} className="text-indigo-600" />
        <h4 className="font-semibold text-gray-900">Correlation</h4>
      </div>
      <div className="text-sm mb-3">
        <span className="text-gray-500">Avg Correlation:</span>{' '}
        <span className="font-mono font-semibold">{avg_correlation ?? 'N/A'}</span>
      </div>
      {high_pairs.length > 0 ? (
        <div className="space-y-2">
          {high_pairs.map((p, i) => (
            <div key={i} className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              <span className="text-xs font-semibold text-yellow-800">
                {p.pair[0]} / {p.pair[1]}
              </span>
              <div className="text-right">
                <span className="text-xs font-mono text-yellow-700">{p.correlation}</span>
                <p className="text-[10px] text-yellow-600">{p.risk}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-green-600">No highly correlated pairs detected.</p>
      )}
    </div>
  )
}

function DrawdownsCard({ drawdowns }) {
  if (!drawdowns) return null
  const worst = drawdowns._worst
  const tickers = Object.keys(drawdowns).filter(k => k !== '_worst')

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown size={16} className="text-red-600" />
        <h4 className="font-semibold text-gray-900">Drawdowns from 52wk High</h4>
      </div>
      {worst?.ticker && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
          <span className="text-xs text-red-800">
            Worst: <strong>{worst.ticker}</strong> at {worst.drawdown_pct}%
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {tickers.map(t => {
          const dd = drawdowns[t]
          const pct = dd?.drawdown_pct
          return (
            <div key={t} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">{t}</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">${dd?.current ?? '-'}</span>
                <span className={clsx('font-mono', pct != null && pct < -15 ? 'text-red-600' : pct != null && pct < -5 ? 'text-orange-600' : 'text-green-600')}>
                  {pct != null ? `${pct}%` : 'N/A'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StopLossCard({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-yellow-600" />
          <h4 className="font-semibold text-gray-900">Stop-Loss Alerts</h4>
        </div>
        <p className="text-xs text-green-600">No positions near or below stop-loss levels.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-yellow-600" />
        <h4 className="font-semibold text-gray-900">Stop-Loss Alerts</h4>
      </div>
      <div className="space-y-2">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={clsx(
              'rounded px-3 py-2 border',
              a.status === 'BELOW_STOP_LOSS' ? 'bg-red-50 border-red-300' : 'bg-yellow-50 border-yellow-300'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{a.ticker}</span>
              <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded',
                a.status === 'BELOW_STOP_LOSS' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
              )}>
                {a.status === 'BELOW_STOP_LOSS' ? 'BELOW STOP' : 'NEAR STOP'}
              </span>
            </div>
            <div className="text-[11px] text-gray-600 mt-1">
              Current: ${a.current} | Stop: ${a.stop_level} | High: ${a.from_high}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RiskDashboard({ data, aiCommentary }) {
  const risk = data?.risk || {}

  const hasData = risk.portfolio_beta || risk.sector_concentration || risk.correlation

  if (!hasData) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Shield size={32} className="mx-auto mb-2 text-gray-300" />
        <p>No risk data available. Run an analysis first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* AI Commentary */}
      {aiCommentary?.commentary && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-orange-900 mb-2">AI Risk Assessment</h3>
          <p className="text-sm text-orange-800 leading-relaxed whitespace-pre-line">
            {aiCommentary.commentary}
          </p>
        </div>
      )}

      {/* Top row: Beta + Sectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BetaCard beta={risk.portfolio_beta} />
        <SectorCard sectors={risk.sector_concentration} />
      </div>

      {/* Middle row: Position Sizing + Correlation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PositionSizingCard sizing={risk.position_sizing} />
        <CorrelationCard correlation={risk.correlation} />
      </div>

      {/* Bottom row: Drawdowns + Stop-Loss */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DrawdownsCard drawdowns={risk.drawdowns} />
        <StopLossCard alerts={risk.stop_loss_alerts} />
      </div>
    </div>
  )
}
