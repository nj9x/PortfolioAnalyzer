import {
  TrendingUp, TrendingDown, Minus, Target, ShieldAlert, ArrowUpDown,
  Shapes, Lightbulb, BarChart3, Eye, AlertTriangle
} from 'lucide-react'
import clsx from 'clsx'

const trendColors = {
  bullish: 'bg-green-100 text-green-800',
  bearish: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-800',
}

const trendIcons = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
}

const strengthColors = {
  strong: 'bg-green-100 text-green-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  weak: 'bg-gray-100 text-gray-600',
}

const confidenceColors = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-red-100 text-red-700',
}

function Badge({ label, colorClass }) {
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', colorClass)}>
      {label}
    </span>
  )
}

function SectionCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={clsx('bg-white rounded-lg border border-gray-200 p-5', className)}>
      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
        {Icon && <Icon size={16} className="text-gray-500" />}
        {title}
      </h4>
      {children}
    </div>
  )
}

function OverviewSection({ results }) {
  const TrendIcon = trendIcons[results.trend] || Minus
  return (
    <SectionCard title="Overview" icon={Eye}>
      <div className="flex flex-wrap gap-2 mb-4">
        {results.ticker && (
          <Badge label={results.ticker} colorClass="bg-blue-100 text-blue-800" />
        )}
        {results.timeframe && (
          <Badge label={results.timeframe} colorClass="bg-purple-100 text-purple-800" />
        )}
        {results.trend && (
          <span className={clsx('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium', trendColors[results.trend])}>
            <TrendIcon size={12} />
            {results.trend}
          </span>
        )}
        {results.overall_bias && results.overall_bias !== results.trend && (
          <Badge label={`Bias: ${results.overall_bias}`} colorClass={trendColors[results.overall_bias]} />
        )}
        {results.confidence && (
          <Badge label={`${results.confidence} confidence`} colorClass={confidenceColors[results.confidence]} />
        )}
      </div>
      {results.summary && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{results.summary}</p>
      )}
    </SectionCard>
  )
}

function EntryPointsSection({ entries }) {
  if (!entries?.length) return null
  return (
    <SectionCard title="Entry Points" icon={Target}>
      <div className="space-y-3">
        {entries.map((e, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge
                label={e.type?.toUpperCase()}
                colorClass={e.type === 'long' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
              />
              <span className="text-sm font-semibold text-gray-900">${e.price}</span>
              {e.risk_reward_ratio && (
                <span className="text-xs text-gray-500">R:R {e.risk_reward_ratio}:1</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
              {e.stop_loss && (
                <div>
                  <span className="text-red-600 font-medium">Stop Loss:</span> ${e.stop_loss}
                </div>
              )}
              {e.take_profit && (
                <div>
                  <span className="text-green-600 font-medium">Take Profit:</span> ${e.take_profit}
                </div>
              )}
            </div>
            {e.reasoning && (
              <p className="text-xs text-gray-600">{e.reasoning}</p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function LevelsSection({ support = [], resistance = [] }) {
  if (!support.length && !resistance.length) return null
  return (
    <SectionCard title="Support & Resistance" icon={ArrowUpDown}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Support */}
        <div>
          <h5 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Support</h5>
          {support.length > 0 ? (
            <div className="space-y-2">
              {support.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-green-50 rounded px-3 py-2">
                  <span className="text-sm font-medium text-gray-900">${s.price}</span>
                  {s.strength && <Badge label={s.strength} colorClass={strengthColors[s.strength]} />}
                  {s.notes && <span className="text-xs text-gray-500 ml-2 truncate max-w-[150px]" title={s.notes}>{s.notes}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">None identified</p>
          )}
        </div>
        {/* Resistance */}
        <div>
          <h5 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">Resistance</h5>
          {resistance.length > 0 ? (
            <div className="space-y-2">
              {resistance.map((r, i) => (
                <div key={i} className="flex items-center justify-between bg-red-50 rounded px-3 py-2">
                  <span className="text-sm font-medium text-gray-900">${r.price}</span>
                  {r.strength && <Badge label={r.strength} colorClass={strengthColors[r.strength]} />}
                  {r.notes && <span className="text-xs text-gray-500 ml-2 truncate max-w-[150px]" title={r.notes}>{r.notes}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">None identified</p>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

function BreakRetestSection({ levels }) {
  if (!levels?.length) return null
  return (
    <SectionCard title="Break & Retest Levels" icon={ShieldAlert}>
      <div className="space-y-2">
        {levels.map((l, i) => (
          <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
            <Badge
              label={l.direction || 'N/A'}
              colorClass={l.direction === 'bullish' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">${l.price}</span>
                {l.status && (
                  <Badge
                    label={l.status}
                    colorClass={
                      l.status === 'confirmed' ? 'bg-green-100 text-green-700'
                      : l.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                    }
                  />
                )}
              </div>
              {l.notes && <p className="text-xs text-gray-600 mt-1">{l.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function PatternsSection({ patterns }) {
  if (!patterns?.length) return null
  return (
    <SectionCard title="Chart Patterns" icon={Shapes}>
      <div className="space-y-2">
        {patterns.map((p, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-900">{p.name}</span>
              {p.status && (
                <Badge
                  label={p.status}
                  colorClass={
                    p.status === 'confirmed' ? 'bg-green-100 text-green-700'
                    : p.status === 'forming' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                  }
                />
              )}
            </div>
            {p.implications && <p className="text-xs text-gray-600">{p.implications}</p>}
            {p.target_price && (
              <p className="text-xs text-blue-600 mt-1 font-medium">Target: ${p.target_price}</p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function TradeSuggestionsSection({ suggestions }) {
  if (!suggestions?.length) return null
  return (
    <SectionCard title="Trade Suggestions" icon={TrendingUp} className="border-blue-200 bg-blue-50/30">
      <div className="space-y-4">
        {suggestions.map((s, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge
                label={s.direction?.toUpperCase()}
                colorClass={s.direction === 'long' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
              />
              {s.risk_reward && (
                <Badge label={`R:R ${s.risk_reward}:1`} colorClass="bg-blue-100 text-blue-800" />
              )}
              {s.timeframe && (
                <Badge label={s.timeframe} colorClass="bg-purple-100 text-purple-800" />
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {s.entry != null && (
                <div>
                  <p className="text-xs text-gray-500">Entry</p>
                  <p className="text-sm font-semibold text-gray-900">${s.entry}</p>
                </div>
              )}
              {s.stop_loss != null && (
                <div>
                  <p className="text-xs text-gray-500">Stop Loss</p>
                  <p className="text-sm font-semibold text-red-600">${s.stop_loss}</p>
                </div>
              )}
              {s.take_profit_1 != null && (
                <div>
                  <p className="text-xs text-gray-500">TP 1</p>
                  <p className="text-sm font-semibold text-green-600">${s.take_profit_1}</p>
                </div>
              )}
              {s.take_profit_2 != null && (
                <div>
                  <p className="text-xs text-gray-500">TP 2</p>
                  <p className="text-sm font-semibold text-green-600">${s.take_profit_2}</p>
                </div>
              )}
            </div>

            {s.position_size_suggestion && (
              <p className="text-xs text-gray-500 mb-2">Position size: {s.position_size_suggestion}</p>
            )}
            {s.reasoning && (
              <p className="text-sm text-gray-700">{s.reasoning}</p>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function RiskRewardSection({ analysis }) {
  if (!analysis) return null
  return (
    <SectionCard title="Risk / Reward Analysis" icon={BarChart3}>
      <div className="space-y-2">
        {analysis.best_rr_setup && (
          <div>
            <p className="text-xs text-gray-500">Best Setup</p>
            <p className="text-sm text-gray-800">{analysis.best_rr_setup}</p>
          </div>
        )}
        {analysis.overall_risk_level && (
          <div>
            <p className="text-xs text-gray-500">Risk Level</p>
            <Badge
              label={analysis.overall_risk_level}
              colorClass={
                analysis.overall_risk_level === 'low' ? 'bg-green-100 text-green-700'
                : analysis.overall_risk_level === 'moderate' ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
              }
            />
          </div>
        )}
        {analysis.key_invalidation && (
          <div>
            <p className="text-xs text-gray-500">Key Invalidation</p>
            <p className="text-sm text-red-700">{analysis.key_invalidation}</p>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function KeyObservationsSection({ observations }) {
  if (!observations?.length) return null
  return (
    <SectionCard title="Key Observations" icon={Lightbulb}>
      <ul className="space-y-1.5">
        {observations.map((obs, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-blue-500 mt-0.5">&#8226;</span>
            {obs}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

export default function ChartAnalysisResults({ analysis }) {
  const results = analysis?.results
  if (!results) return null

  return (
    <div className="space-y-4">
      <OverviewSection results={results} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EntryPointsSection entries={results.entry_points} />
        <LevelsSection support={results.support_levels} resistance={results.resistance_levels} />
      </div>

      <TradeSuggestionsSection suggestions={results.trade_suggestions} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakRetestSection levels={results.break_retest_levels} />
        <PatternsSection patterns={results.patterns} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RiskRewardSection analysis={results.risk_reward_analysis} />
        <KeyObservationsSection observations={results.key_observations} />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          These are AI-generated suggestions based on visual chart analysis, not financial advice.
          Always conduct your own due diligence and consult with qualified financial professionals
          before making investment decisions.
        </p>
      </div>
    </div>
  )
}
