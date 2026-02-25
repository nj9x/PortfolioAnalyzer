import { useState, useEffect } from 'react'
import {
  Search, TrendingUp, BarChart3, BrainCircuit,
  CheckCircle2, Loader2, Save
} from 'lucide-react'
import clsx from 'clsx'

const CHART_STEPS = [
  { id: 'validate', label: 'Validating ticker',                icon: Search,       duration: 1000  },
  { id: 'fetch',    label: 'Fetching 6 months of price data',  icon: TrendingUp,   duration: 3000  },
  { id: 'format',   label: 'Formatting OHLCV data',            icon: BarChart3,    duration: 1000  },
  { id: 'claude',   label: 'Claude analyzing patterns & levels', icon: BrainCircuit, duration: 55000 },
  { id: 'save',     label: 'Saving results',                   icon: Save,         duration: 1000  },
]

export default function ChartAnalysisLoading({ ticker }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    if (currentStep >= CHART_STEPS.length) return
    const timer = setTimeout(() => {
      if (currentStep < CHART_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1)
      }
    }, CHART_STEPS[currentStep].duration)
    return () => clearTimeout(timer)
  }, [currentStep])

  useEffect(() => {
    const interval = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const totalDuration = CHART_STEPS.reduce((sum, s) => sum + s.duration, 0)
  const completedDuration = CHART_STEPS.slice(0, currentStep).reduce((sum, s) => sum + s.duration, 0)
  const progressPct = Math.min(95, Math.round((completedDuration / totalDuration) * 100))

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-2">
              <BrainCircuit className="text-white" size={22} />
            </div>
            <div>
              <h3 className="text-white font-semibold text-base">
                Analyzing {ticker || 'Chart'}
              </h3>
              <p className="text-indigo-100 text-xs mt-0.5">
                Running AI technical analysis on price data
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-white/80 text-xs font-mono">
              {formatTime(elapsed)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-indigo-100 mb-1.5">
            <span>Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="px-6 py-4">
        <div className="space-y-1">
          {CHART_STEPS.map((step, idx) => {
            const Icon = step.icon
            const isComplete = idx < currentStep
            const isCurrent = idx === currentStep
            const isPending = idx > currentStep

            return (
              <div
                key={step.id}
                className={clsx(
                  'flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300',
                  isCurrent && 'bg-indigo-50',
                  isComplete && 'opacity-60',
                  isPending && 'opacity-30'
                )}
              >
                <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                  {isComplete ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : isCurrent ? (
                    <Loader2 size={18} className="text-indigo-600 animate-spin" />
                  ) : (
                    <Icon size={18} className="text-gray-400" />
                  )}
                </div>
                <span
                  className={clsx(
                    'text-sm flex-1',
                    isCurrent && 'text-indigo-700 font-medium',
                    isComplete && 'text-gray-500',
                    isPending && 'text-gray-400'
                  )}
                >
                  {step.label}
                  {isCurrent && <span className="text-indigo-400">{dots}</span>}
                </span>
                {isComplete && (
                  <span className="text-xs text-green-500 font-medium">Done</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tip */}
      <div className="px-6 pb-5">
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          <p className="text-xs text-amber-700">
            <span className="font-medium">Tip:</span>{' '}
            {elapsed > 120
              ? 'This is taking longer than usual. The analysis will complete shortly or time out automatically.'
              : currentStep < 3
                ? `Price data is being fetched from Massive API for ${ticker || 'the ticker'}.`
                : 'Claude is reviewing 6 months of OHLCV data to identify patterns, support/resistance levels, and trade setups. This typically takes 30-60 seconds.'}
          </p>
        </div>
      </div>
    </div>
  )
}
