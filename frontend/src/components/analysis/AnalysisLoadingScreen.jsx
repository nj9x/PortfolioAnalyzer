import { useState, useEffect } from 'react'
import {
  TrendingUp, BarChart3, Newspaper, Globe, Shield,
  DollarSign, Gauge, BrainCircuit, CheckCircle2, Loader2
} from 'lucide-react'
import clsx from 'clsx'

const ANALYSIS_STEPS = [
  { id: 'quotes',       label: 'Fetching stock quotes',           icon: TrendingUp,  duration: 4000  },
  { id: 'news',         label: 'Gathering financial news',        icon: Newspaper,   duration: 3000  },
  { id: 'economic',     label: 'Loading economic indicators',     icon: Globe,       duration: 2000  },
  { id: 'technicals',   label: 'Computing technical analysis',    icon: BarChart3,   duration: 8000  },
  { id: 'fundamentals', label: 'Analyzing fundamentals',          icon: DollarSign,  duration: 10000 },
  { id: 'options',      label: 'Scanning options chains',         icon: Gauge,       duration: 6000  },
  { id: 'risk',         label: 'Calculating risk metrics',        icon: Shield,      duration: 5000  },
  { id: 'claude',       label: 'Claude is generating insights',   icon: BrainCircuit, duration: 60000 },
]

export default function AnalysisLoadingScreen({ portfolioName }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [dots, setDots] = useState('')

  // Progress through steps on a timer
  useEffect(() => {
    if (currentStep >= ANALYSIS_STEPS.length) return

    const timer = setTimeout(() => {
      if (currentStep < ANALYSIS_STEPS.length - 1) {
        setCurrentStep(prev => prev + 1)
      }
    }, ANALYSIS_STEPS[currentStep].duration)

    return () => clearTimeout(timer)
  }, [currentStep])

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Animated dots for current step
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

  // Overall progress percentage (approximate)
  const totalDuration = ANALYSIS_STEPS.reduce((sum, s) => sum + s.duration, 0)
  const completedDuration = ANALYSIS_STEPS.slice(0, currentStep).reduce((sum, s) => sum + s.duration, 0)
  const progressPct = Math.min(95, Math.round((completedDuration / totalDuration) * 100))

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-2">
              <BrainCircuit className="text-white" size={22} />
            </div>
            <div>
              <h3 className="text-white font-semibold text-base">
                Analyzing {portfolioName || 'Portfolio'}
              </h3>
              <p className="text-blue-100 text-xs mt-0.5">
                Gathering data and generating AI insights
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
          <div className="flex justify-between text-xs text-blue-100 mb-1.5">
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
          {ANALYSIS_STEPS.map((step, idx) => {
            const Icon = step.icon
            const isComplete = idx < currentStep
            const isCurrent = idx === currentStep
            const isPending = idx > currentStep

            return (
              <div
                key={step.id}
                className={clsx(
                  'flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-300',
                  isCurrent && 'bg-blue-50',
                  isComplete && 'opacity-60',
                  isPending && 'opacity-30'
                )}
              >
                {/* Status icon */}
                <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                  {isComplete ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : isCurrent ? (
                    <Loader2 size={18} className="text-blue-600 animate-spin" />
                  ) : (
                    <Icon size={18} className="text-gray-400" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={clsx(
                    'text-sm flex-1',
                    isCurrent && 'text-blue-700 font-medium',
                    isComplete && 'text-gray-500',
                    isPending && 'text-gray-400'
                  )}
                >
                  {step.label}
                  {isCurrent && <span className="text-blue-400">{dots}</span>}
                </span>

                {/* Checkmark or waiting */}
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
            {elapsed > 180
              ? 'This is taking longer than usual. The analysis will complete shortly or time out automatically.'
              : currentStep < 7
                ? 'Market data is being fetched from Massive API and processed for analysis.'
                : 'Claude is reviewing all market data and generating personalized portfolio insights. This typically takes 30-90 seconds.'}
          </p>
        </div>
      </div>
    </div>
  )
}
