import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useAnalyzeChart, useChartHistory, useChartAnalysis, useAnalyzeTicker, useTickerSearch } from '../hooks/useChartAnalysis'
import { getChartImageUrl } from '../api/chartAnalysis'
import ChartAnalysisResults from '../components/chart/ChartAnalysisResults'
import ChartAnalysisLoading from '../components/chart/ChartAnalysisLoading'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import {
  ImagePlus, Play, Upload, X, Clock, TrendingUp, TrendingDown, Minus, Trash2, Search, Loader2
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

export default function ChartAnalysis() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [userNotes, setUserNotes] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [tickerInput, setTickerInput] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const analyze = useAnalyzeChart()
  const analyzeTicker = useAnalyzeTicker()
  const { data: tickerResults = [], isFetching: isSearching } = useTickerSearch(tickerInput)
  const { data: history = [] } = useChartHistory()
  const { data: selectedAnalysis } = useChartAnalysis(selectedId)

  const isPending = analyze.isPending || analyzeTicker.isPending

  // The latest result: either the mutation response or a loaded history item
  const currentAnalysis = selectedId ? selectedAnalysis : (analyzeTicker.data || analyze.data)

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) {
      const f = accepted[0]
      setFile(f)
      setPreview(URL.createObjectURL(f))
      setSelectedId(null)  // clear history selection when new file is dropped
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    multiple: false,
  })

  const handleAnalyze = () => {
    if (!file) return
    setSelectedId(null)
    analyzeTicker.reset()
    analyze.mutate({ file, analysisType: 'technical', userNotes })
  }

  const handleTickerAnalyze = (e) => {
    e.preventDefault()
    if (!tickerInput.trim()) return
    setSelectedId(null)
    setFile(null)
    setPreview(null)
    analyze.reset()
    analyzeTicker.mutate({ ticker: tickerInput.trim(), userNotes })
  }

  const handleClear = () => {
    setFile(null)
    setPreview(null)
    setUserNotes('')
    setSelectedId(null)
    setTickerInput('')
    analyze.reset()
    analyzeTicker.reset()
  }

  const handleHistoryClick = (id) => {
    setSelectedId(id)
    setFile(null)
    setPreview(null)
    analyze.reset()
    analyzeTicker.reset()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <ImagePlus size={22} className="text-blue-600" />
          Chart Analysis
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Ticker Search + Upload + History */}
        <div className="space-y-4">
          {/* Ticker Search */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-3">Analyze by Ticker</h3>
            <form onSubmit={handleTickerAnalyze} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={tickerInput}
                  onChange={(e) => {
                    setTickerInput(e.target.value.toUpperCase())
                    setShowDropdown(true)
                  }}
                  onFocus={() => { if (tickerInput.length >= 1) setShowDropdown(true) }}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  placeholder="Enter ticker (e.g. AAPL)"
                  className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  disabled={isPending}
                  autoComplete="off"
                />
                {isSearching && tickerInput.length >= 1 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 size={14} className="animate-spin text-gray-400" />
                  </div>
                )}

                {/* Autocomplete dropdown */}
                {showDropdown && tickerInput.length >= 1 && tickerResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {tickerResults.map((t) => (
                      <button
                        key={t.ticker}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setTickerInput(t.ticker)
                          setShowDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                      >
                        <span className="font-mono font-semibold text-sm text-gray-900 min-w-[60px]">
                          {t.ticker}
                        </span>
                        <span className="text-xs text-gray-500 truncate flex-1">
                          {t.name}
                        </span>
                        {t.primary_exchange && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {t.primary_exchange}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!tickerInput.trim() || isPending}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {analyzeTicker.isPending ? (
                  <>
                    <LoadingSpinner message="" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Analyze
                  </>
                )}
              </button>
            </form>
            {analyzeTicker.isError && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                {analyzeTicker.error?.response?.data?.detail || 'Ticker analysis failed'}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">Fetches 6 months of daily data and runs AI technical analysis</p>
          </div>

          {/* Upload Area */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-3">Or Upload Chart</h3>

            {!file ? (
              <div
                {...getRootProps()}
                className={clsx(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragActive
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                )}
              >
                <input {...getInputProps()} />
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  {isDragActive
                    ? 'Drop chart screenshot here...'
                    : 'Drag & drop a TradingView screenshot, or click to select'}
                </p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, or WebP</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <img
                    src={preview}
                    alt="Chart preview"
                    className="w-full rounded-lg border border-gray-200"
                  />
                  <button
                    onClick={handleClear}
                    className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-gray-100"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 truncate">{file.name}</p>
              </div>
            )}

            {/* User Notes */}
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="e.g. Looking for swing entries on the 4H timeframe..."
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={2}
              />
            </div>

            {/* Analyze Button */}
            <button
              onClick={handleAnalyze}
              disabled={!file || isPending}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyze.isPending ? (
                <>
                  <LoadingSpinner message="" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Analyze Chart
                </>
              )}
            </button>

            {analyze.isError && (
              <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                {analyze.error?.response?.data?.detail || 'Analysis failed'}
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <Clock size={16} />
                History
              </h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {history.map((h) => {
                  const TrendIcon = trendIcons[h.trend] || Minus
                  return (
                    <button
                      key={h.id}
                      onClick={() => handleHistoryClick(h.id)}
                      className={clsx(
                        'w-full text-left p-3 rounded-lg border transition-colors',
                        selectedId === h.id
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-100 hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {h.ticker && (
                            <span className="text-sm font-semibold text-gray-900">{h.ticker}</span>
                          )}
                          {h.timeframe && (
                            <span className="text-xs text-gray-500">{h.timeframe}</span>
                          )}
                          {h.trend && (
                            <span className={clsx('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium', trendColors[h.trend])}>
                              <TrendIcon size={10} />
                              {h.trend}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(h.created_at).toLocaleString()}
                      </p>
                      {h.original_filename && (
                        <p className="text-xs text-gray-400 truncate">{h.original_filename}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Results */}
        <div className="lg:col-span-2">
          {isPending && (
            <ChartAnalysisLoading ticker={analyzeTicker.isPending ? tickerInput : null} />
          )}

          {currentAnalysis && !isPending && (
            <div className="space-y-4">
              {/* Show the chart image if viewing from history (only for image-based analyses) */}
              {selectedId && currentAnalysis.image_path && (
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <img
                    src={getChartImageUrl(selectedId)}
                    alt="Analyzed chart"
                    className="w-full rounded-lg"
                  />
                </div>
              )}
              <ChartAnalysisResults analysis={currentAnalysis} />
            </div>
          )}

          {!currentAnalysis && !isPending && (
            <EmptyState
              icon={ImagePlus}
              title="Upload a Chart"
              description="Upload a TradingView screenshot to get AI-powered technical analysis with entry points, support/resistance levels, and trade suggestions."
            />
          )}
        </div>
      </div>
    </div>
  )
}
