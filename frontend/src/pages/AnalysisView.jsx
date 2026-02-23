import { useState } from 'react'
import { usePortfolioContext } from '../context/PortfolioContext'
import { useLatestAnalysis, useAnalysisHistory, useTriggerAnalysis } from '../hooks/useAnalysis'
import { usePortfolio } from '../hooks/usePortfolios'
import { useTechnicals, useFundamentals, useOptionsData, usePortfolioRisk } from '../hooks/useMarketData'
import RiskAssessment from '../components/analysis/RiskAssessment'
import RecommendationCard from '../components/analysis/RecommendationCard'
import TechnicalDashboard from '../components/analysis/TechnicalDashboard'
import FundamentalScreening from '../components/analysis/FundamentalScreening'
import RiskDashboard from '../components/analysis/RiskDashboard'
import OptionsMonitor from '../components/analysis/OptionsMonitor'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import {
  BrainCircuit, Play, Clock, BarChart3, DollarSign, Shield, Gauge, LayoutDashboard
} from 'lucide-react'
import clsx from 'clsx'

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'technical', label: 'Technical', icon: BarChart3 },
  { key: 'fundamentals', label: 'Fundamentals', icon: DollarSign },
  { key: 'risk', label: 'Risk', icon: Shield },
  { key: 'options', label: 'Options', icon: Gauge },
]

export default function AnalysisView() {
  const [activeTab, setActiveTab] = useState('overview')
  const { selectedPortfolioId } = usePortfolioContext()
  const { data: portfolio } = usePortfolio(selectedPortfolioId)
  const { data: analysis, isLoading, error } = useLatestAnalysis(selectedPortfolioId)
  const { data: history = [] } = useAnalysisHistory(selectedPortfolioId)
  const trigger = useTriggerAnalysis()

  // Real-time data hooks
  const { data: techData, isLoading: techLoading } = useTechnicals(selectedPortfolioId)
  const { data: fundData, isLoading: fundLoading } = useFundamentals(selectedPortfolioId)
  const { data: optData, isLoading: optLoading } = useOptionsData(selectedPortfolioId)
  const { data: riskData, isLoading: riskLoading } = usePortfolioRisk(selectedPortfolioId)

  if (!selectedPortfolioId) {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="Select a Portfolio"
        description="Choose a portfolio to run AI analysis."
      />
    )
  }

  const handleAnalyze = () => trigger.mutate(selectedPortfolioId)

  const isTabLoading = {
    technical: techLoading,
    fundamentals: fundLoading,
    options: optLoading,
    risk: riskLoading,
  }

  return (
    <div className="space-y-6">
      {/* Header with Run button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          AI Analysis {portfolio ? `- ${portfolio.name}` : ''}
        </h2>
        <button
          onClick={handleAnalyze}
          disabled={trigger.isPending}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {trigger.isPending ? (
            <>
              <LoadingSpinner message="" />
              Analyzing...
            </>
          ) : (
            <>
              <Play size={16} />
              Run Analysis
            </>
          )}
        </button>
      </div>

      {/* Analysis status messages */}
      {trigger.isPending && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <LoadingSpinner message="Claude is analyzing your portfolio with technical, fundamental, risk, and options data. This may take a moment..." />
        </div>
      )}

      {trigger.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Analysis failed: {trigger.error?.response?.data?.detail || 'Unknown error'}
        </div>
      )}

      {isLoading && <LoadingSpinner message="Loading latest analysis..." />}

      {!isLoading && !analysis && !trigger.isPending && (
        <EmptyState
          icon={BrainCircuit}
          title="No Analysis Yet"
          description="Click 'Run Analysis' to get AI-powered recommendations for this portfolio."
        />
      )}

      {/* Tab Bar */}
      {(analysis || techData || fundData || optData || riskData) && (
        <>
          <div className="border-b border-gray-200">
            <nav className="flex gap-0 -mb-px overflow-x-auto">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={clsx(
                      'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                      isActive
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    )}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && analysis && (
              <div className="space-y-6">
                <RiskAssessment score={analysis.risk_score} outlook={analysis.market_outlook} />

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="font-medium text-gray-900 mb-3">Analysis Summary</h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                    {analysis.summary}
                  </p>
                  <p className="text-xs text-gray-400 mt-4">
                    Generated by {analysis.model_used} on{' '}
                    {new Date(analysis.created_at).toLocaleString()}
                  </p>
                </div>

                {analysis.recommendations?.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">Recommendations</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {analysis.recommendations.map((rec) => (
                        <RecommendationCard key={rec.id} rec={rec} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-xs text-amber-800">
                    These are AI-generated suggestions based on available market data, not financial
                    advice. Always conduct your own due diligence and consult with qualified financial
                    professionals before making investment decisions.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'overview' && !analysis && (
              <EmptyState
                icon={LayoutDashboard}
                title="No Overview Data"
                description="Run an analysis to see the overview."
              />
            )}

            {/* TECHNICAL TAB */}
            {activeTab === 'technical' && (
              isTabLoading.technical ? (
                <LoadingSpinner message="Loading technical indicators..." />
              ) : (
                <TechnicalDashboard
                  data={techData}
                  aiCommentary={analysis?.technical_analysis}
                />
              )
            )}

            {/* FUNDAMENTALS TAB */}
            {activeTab === 'fundamentals' && (
              isTabLoading.fundamentals ? (
                <LoadingSpinner message="Loading fundamental metrics..." />
              ) : (
                <FundamentalScreening
                  data={fundData}
                  aiCommentary={analysis?.fundamental_analysis}
                />
              )
            )}

            {/* RISK TAB */}
            {activeTab === 'risk' && (
              isTabLoading.risk ? (
                <LoadingSpinner message="Loading risk metrics..." />
              ) : (
                <RiskDashboard
                  data={riskData}
                  aiCommentary={analysis?.risk_management}
                />
              )
            )}

            {/* OPTIONS TAB */}
            {activeTab === 'options' && (
              isTabLoading.options ? (
                <LoadingSpinner message="Loading options data..." />
              ) : (
                <OptionsMonitor
                  data={optData}
                  aiCommentary={analysis?.options_analysis}
                />
              )
            )}
          </div>
        </>
      )}

      {/* Analysis History */}
      {history.length > 1 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Clock size={16} /> Analysis History
          </h3>
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <span className="text-gray-900">{new Date(h.created_at).toLocaleString()}</span>
                  <span className="text-gray-500 ml-3">
                    Risk: {h.risk_score ?? '-'}/10 | {h.market_outlook || 'N/A'}
                  </span>
                </div>
                <span className="text-xs text-gray-400 truncate max-w-xs">{h.summary?.slice(0, 80)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
