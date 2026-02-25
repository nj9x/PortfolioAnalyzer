import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { searchFilings, getFilingContent, aiSearchFiling, aiAnalyzeFiling } from '../api/secFilings'
import EmptyState from '../components/common/EmptyState'
import DOMPurify from 'dompurify'
import {
  FileText, Search, Loader2, ExternalLink, Sparkles, ChevronRight,
  X, ArrowUp, Filter, Eye, Code, BrainCircuit, AlertTriangle,
  TrendingUp, Shield, CheckCircle2
} from 'lucide-react'
import clsx from 'clsx'

// ─── Form type badge colors ──────────────────────────────────────────
const formColors = {
  '10-K': 'bg-blue-100 text-blue-800',
  '10-Q': 'bg-purple-100 text-purple-800',
  '8-K':  'bg-amber-100 text-amber-800',
}

// ─── Filing type filter options ──────────────────────────────────────
const FILING_TYPE_OPTIONS = [
  { value: '10-K,10-Q,8-K', label: 'All' },
  { value: '10-K', label: '10-K' },
  { value: '10-Q', label: '10-Q' },
  { value: '8-K', label: '8-K' },
  { value: '10-K,10-Q', label: '10-K & 10-Q' },
]

export default function SECFilings() {
  const [ticker, setTicker] = useState('')
  const [submittedTicker, setSubmittedTicker] = useState('')
  const [filingTypes, setFilingTypes] = useState('10-K,10-Q,8-K')
  const [selectedFiling, setSelectedFiling] = useState(null)
  const [aiQuery, setAiQuery] = useState('')
  const [aiResults, setAiResults] = useState(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [viewMode, setViewMode] = useState('document') // 'document' | 'text'
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false)
  const contentRef = useRef(null)
  const iframeRef = useRef(null)
  const searchInputRef = useRef(null)

  // Fetch filings list
  const {
    data: filingsData,
    isLoading: filingsLoading,
    isError: filingsError,
    error: filingsErrorObj,
  } = useQuery({
    queryKey: ['sec-filings-list', submittedTicker, filingTypes],
    queryFn: () => searchFilings(submittedTicker, filingTypes),
    enabled: !!submittedTicker,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  })

  // Fetch filing content when a filing is selected
  const {
    data: contentData,
    isLoading: contentLoading,
  } = useQuery({
    queryKey: ['sec-filing-content', selectedFiling?.accession],
    queryFn: () => getFilingContent(
      selectedFiling.accession,
      filingsData?.cik || '',
      ''
    ),
    enabled: !!selectedFiling?.accession && !!filingsData?.cik,
    staleTime: 60 * 60 * 1000,
  })

  // AI search mutation
  const aiSearch = useMutation({
    mutationFn: ({ accession, cik, query }) => aiSearchFiling(accession, cik, query),
    onSuccess: (data) => {
      setAiResults(data.result)
      setShowAiPanel(true)
    },
  })

  // AI comprehensive analysis mutation
  const aiAnalyze = useMutation({
    mutationFn: ({ accession, cik, filingType }) =>
      aiAnalyzeFiling(accession, cik, '', filingType),
    onSuccess: (data) => {
      setAiAnalysis(data.result)
      setShowAnalysisPanel(true)
    },
  })

  const handleSearch = (e) => {
    e.preventDefault()
    if (!ticker.trim()) return
    setSubmittedTicker(ticker.trim().toUpperCase())
    setSelectedFiling(null)
    setAiResults(null)
    setShowAiPanel(false)
    setAiAnalysis(null)
    setShowAnalysisPanel(false)
  }

  const handleFilingClick = (filing) => {
    setSelectedFiling(filing)
    setAiResults(null)
    setShowAiPanel(false)
    setAiAnalysis(null)
    setShowAnalysisPanel(false)
    setViewMode('document')
    if (contentRef.current) contentRef.current.scrollTop = 0
  }

  const handleAiSearch = (e) => {
    e.preventDefault()
    if (!aiQuery.trim() || !selectedFiling) return
    aiSearch.mutate({
      accession: selectedFiling.accession,
      cik: filingsData?.cik || '',
      query: aiQuery.trim(),
    })
  }

  const handleAiAnalyze = () => {
    if (!selectedFiling) return
    aiAnalyze.mutate({
      accession: selectedFiling.accession,
      cik: filingsData?.cik || '',
      filingType: selectedFiling.form || '',
    })
  }

  // Keyboard shortcut: Ctrl+K to focus AI search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const scrollToTop = useCallback(() => {
    if (viewMode === 'document' && iframeRef.current) {
      try { iframeRef.current.contentWindow?.scrollTo(0, 0) } catch {}
    } else if (contentRef.current) {
      contentRef.current.scrollTop = 0
    }
  }, [viewMode])

  // Sanitised HTML for iframe srcdoc
  const sanitizedHtml = useMemo(() => {
    if (!contentData?.html_content) return null
    return DOMPurify.sanitize(contentData.html_content, {
      WHOLE_DOCUMENT: true,
      ADD_TAGS: ['style', 'link', 'base'],
      ADD_ATTR: ['target', 'href'],
    })
  }, [contentData?.html_content])

  const filings = filingsData?.filings || []
  const companyName = filingsData?.company_name || ''

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <FileText size={22} className="text-blue-600" />
          SEC Filings Explorer
        </h2>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker (e.g. AAPL)"
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={!ticker.trim() || filingsLoading}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {filingsLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </form>

        {/* Filing type filter */}
        <div className="flex items-center gap-1">
          <Filter size={14} className="text-gray-400" />
          {FILING_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilingTypes(opt.value)}
              className={clsx(
                'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                filingTypes === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Pane */}
      {!submittedTicker ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={FileText}
            title="Search SEC Filings"
            description="Enter a ticker symbol to browse 10-K, 10-Q, and 8-K filings from SEC EDGAR. Select a filing to preview its content, then use AI to search for specific information."
          />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
          {/* Left Panel: Filings List */}
          <div className="col-span-4 xl:col-span-3 flex flex-col min-h-0 bg-white rounded-xl border border-gray-200">
            {/* Company Header */}
            {companyName && (
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{companyName}</p>
                <p className="text-xs text-gray-400">{submittedTicker} &middot; CIK {filingsData?.cik}</p>
                {filingsData?.sic_description && (
                  <p className="text-xs text-gray-400 truncate">{filingsData.sic_description}</p>
                )}
              </div>
            )}

            {/* Filings List */}
            <div className="flex-1 overflow-y-auto">
              {filingsLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading filings...
                </div>
              ) : filingsError ? (
                <div className="p-4 text-sm text-red-600">
                  {filingsErrorObj?.response?.data?.detail || 'Failed to load filings. Check the ticker and try again.'}
                </div>
              ) : filings.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No filings found.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filings.map((filing, i) => (
                    <button
                      key={`${filing.accession}-${i}`}
                      onClick={() => handleFilingClick(filing)}
                      className={clsx(
                        'w-full text-left px-4 py-3 transition-colors group',
                        selectedFiling?.accession === filing.accession
                          ? 'bg-blue-50 border-l-2 border-blue-600'
                          : 'hover:bg-gray-50 border-l-2 border-transparent'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx(
                          'text-xs font-bold px-1.5 py-0.5 rounded',
                          formColors[filing.form] || 'bg-gray-100 text-gray-700'
                        )}>
                          {filing.form}
                        </span>
                        <span className="text-xs text-gray-500">{filing.filing_date}</span>
                        <ChevronRight size={12} className={clsx(
                          'ml-auto transition-colors',
                          selectedFiling?.accession === filing.accession ? 'text-blue-600' : 'text-gray-300'
                        )} />
                      </div>
                      <p className="text-sm text-gray-700 truncate">
                        {filing.description || `${filing.form} Filing`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Document Preview + AI */}
          <div className="col-span-8 xl:col-span-9 flex flex-col min-h-0">
            {!selectedFiling ? (
              <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-gray-200">
                <EmptyState
                  icon={FileText}
                  title="Select a Filing"
                  description="Choose a filing from the left to preview its content."
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 gap-3">
                {/* Document Header + AI Controls */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        'text-xs font-bold px-2 py-0.5 rounded',
                        formColors[selectedFiling.form] || 'bg-gray-100 text-gray-700'
                      )}>
                        {selectedFiling.form}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {selectedFiling.description || `${selectedFiling.form} Filing`}
                      </span>
                      <span className="text-xs text-gray-400">{selectedFiling.filing_date}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {contentData?.url && (
                        <a
                          href={contentData.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          <ExternalLink size={12} /> Open Original
                        </a>
                      )}
                      <a
                        href={selectedFiling.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        View on SEC <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>

                  {/* AI Search + Full Analysis */}
                  <div className="flex gap-2">
                    <form onSubmit={handleAiSearch} className="flex gap-2 flex-1">
                      <div className="relative flex-1">
                        <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={aiQuery}
                          onChange={(e) => setAiQuery(e.target.value)}
                          placeholder="Ask AI about this filing... (Ctrl+K)"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!aiQuery.trim() || aiSearch.isPending}
                        className="flex items-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {aiSearch.isPending ? (
                          <><Loader2 size={14} className="animate-spin" /> Searching...</>
                        ) : (
                          <><Sparkles size={14} /> Ask AI</>
                        )}
                      </button>
                    </form>
                    <button
                      onClick={handleAiAnalyze}
                      disabled={aiAnalyze.isPending || contentLoading}
                      className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {aiAnalyze.isPending ? (
                        <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
                      ) : (
                        <><BrainCircuit size={14} /> Full AI Analysis</>
                      )}
                    </button>
                  </div>

                  {aiSearch.isError && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                      {aiSearch.error?.response?.data?.detail || 'AI search failed'}
                    </div>
                  )}
                  {aiAnalyze.isError && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                      {aiAnalyze.error?.response?.data?.detail || 'AI analysis failed'}
                    </div>
                  )}
                </div>

                {/* AI Search Results Panel */}
                {showAiPanel && aiResults && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex-shrink-0 max-h-[40%] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
                        <Sparkles size={14} /> AI Answer
                      </h4>
                      <button
                        onClick={() => setShowAiPanel(false)}
                        className="p-1 rounded hover:bg-purple-100 text-purple-400 hover:text-purple-700"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <p className="text-sm text-gray-800 mb-3">{aiResults.answer}</p>

                    {aiResults.key_figures?.length > 0 && (
                      <div className="mb-3">
                        <h5 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">Key Figures</h5>
                        <div className="flex flex-wrap gap-2">
                          {aiResults.key_figures.map((fig, i) => (
                            <div key={i} className="bg-white rounded-lg border border-purple-200 px-3 py-1.5">
                              <span className="text-xs text-gray-500">{fig.label}: </span>
                              <span className="text-sm font-mono font-semibold text-gray-900">{fig.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiResults.excerpts?.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">Relevant Excerpts</h5>
                        <div className="space-y-2">
                          {aiResults.excerpts.map((exc, i) => (
                            <div key={i} className="bg-white rounded-lg border border-purple-100 p-3">
                              <p className="text-xs text-purple-600 font-medium mb-1">{exc.context}</p>
                              <p className="text-sm text-gray-700 italic">"{exc.text}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Comprehensive Analysis Panel */}
                {showAnalysisPanel && aiAnalysis && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex-shrink-0 max-h-[50%] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
                        <BrainCircuit size={14} /> Filing Analysis
                      </h4>
                      <button
                        onClick={() => setShowAnalysisPanel(false)}
                        className="p-1 rounded hover:bg-indigo-100 text-indigo-400 hover:text-indigo-700"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Executive Summary */}
                    <p className="text-sm text-gray-800 mb-4">{aiAnalysis.executive_summary}</p>

                    {/* Key Financials */}
                    {aiAnalysis.key_financials?.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
                          Key Financial Metrics
                        </h5>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                          {aiAnalysis.key_financials.map((kf, i) => (
                            <div key={i} className="bg-white rounded-lg border border-indigo-100 px-3 py-2">
                              <span className="text-xs text-gray-500 block">{kf.metric}</span>
                              <span className="text-sm font-semibold text-gray-900">{kf.value}</span>
                              {kf.change && (
                                <span className={clsx('text-xs ml-1',
                                  kf.change?.startsWith('+') ? 'text-green-600' : kf.change?.startsWith('-') ? 'text-red-600' : 'text-gray-500'
                                )}>{kf.change}</span>
                              )}
                              {kf.assessment && (
                                <p className="text-xs text-gray-400 mt-0.5">{kf.assessment}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notable Items */}
                    {aiAnalysis.notable_items?.length > 0 && (
                      <div className="mb-4">
                        <h5 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
                          Notable Items
                        </h5>
                        <div className="space-y-2">
                          {aiAnalysis.notable_items.map((item, i) => (
                            <div key={i} className="bg-white rounded-lg border border-indigo-100 p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded',
                                  item.severity === 'high' ? 'bg-red-100 text-red-800' :
                                  item.severity === 'medium' ? 'bg-amber-100 text-amber-800' :
                                  'bg-green-100 text-green-800'
                                )}>{item.category}</span>
                                <span className="text-sm font-medium text-gray-900">{item.title}</span>
                              </div>
                              <p className="text-xs text-gray-600">{item.detail}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Risk Assessment */}
                    {aiAnalysis.risk_assessment && (
                      <div className="mb-4">
                        <h5 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
                          Risk Assessment
                        </h5>
                        <div className="bg-white rounded-lg border border-indigo-100 p-3">
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded mb-2 inline-block',
                            aiAnalysis.risk_assessment.overall_risk === 'high' ? 'bg-red-100 text-red-800' :
                            aiAnalysis.risk_assessment.overall_risk === 'medium' ? 'bg-amber-100 text-amber-800' :
                            'bg-green-100 text-green-800'
                          )}>
                            {aiAnalysis.risk_assessment.overall_risk?.toUpperCase()} RISK
                          </span>
                          {aiAnalysis.risk_assessment.risk_changes && (
                            <p className="text-xs text-gray-600 mt-1">{aiAnalysis.risk_assessment.risk_changes}</p>
                          )}
                          {aiAnalysis.risk_assessment.key_risks?.length > 0 && (
                            <ul className="text-xs text-gray-700 space-y-1 mt-2">
                              {aiAnalysis.risk_assessment.key_risks.map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5">
                                  <AlertTriangle size={10} className="text-amber-500 mt-0.5 shrink-0" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Management Outlook */}
                    {aiAnalysis.management_outlook && (
                      <div className="mb-4">
                        <h5 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">
                          Management Outlook
                        </h5>
                        <div className="bg-white rounded-lg border border-indigo-100 p-3">
                          <p className="text-xs text-gray-700">{aiAnalysis.management_outlook}</p>
                        </div>
                      </div>
                    )}

                    {/* Positive Signals & Red Flags */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {aiAnalysis.positive_signals?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1.5">
                            Positive Signals
                          </h5>
                          <ul className="text-xs text-gray-700 space-y-1">
                            {aiAnalysis.positive_signals.map((s, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <CheckCircle2 size={10} className="text-green-500 mt-0.5 shrink-0" /> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiAnalysis.red_flags?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1.5">
                            Red Flags
                          </h5>
                          <ul className="text-xs text-gray-700 space-y-1">
                            {aiAnalysis.red_flags.map((f, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <AlertTriangle size={10} className="text-red-500 mt-0.5 shrink-0" /> {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Disclaimer */}
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-amber-700">
                        AI-generated analysis. Not financial advice. Always verify key data points against the source document.
                      </p>
                    </div>
                  </div>
                )}

                {/* Document Content */}
                <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden min-h-0 relative flex flex-col">
                  {/* View mode toggle */}
                  {contentData && (contentData.html_content || contentData.content) && (
                    <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                      <button
                        onClick={() => setViewMode('document')}
                        className={clsx(
                          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                          viewMode === 'document'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        )}
                      >
                        <Eye size={12} /> Document
                      </button>
                      <button
                        onClick={() => setViewMode('text')}
                        className={clsx(
                          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                          viewMode === 'text'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                        )}
                      >
                        <Code size={12} /> Plain Text
                      </button>
                      {contentData.truncated && (
                        <span className="text-xs text-amber-600 ml-auto">
                          Truncated ({(contentData.char_count / 1000).toFixed(0)}k chars)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Content area */}
                  {contentLoading ? (
                    <div className="flex items-center justify-center flex-1 text-gray-400 text-sm gap-2">
                      <Loader2 size={16} className="animate-spin" /> Loading document...
                    </div>
                  ) : viewMode === 'document' && sanitizedHtml ? (
                    <>
                      <iframe
                        ref={iframeRef}
                        title="SEC Filing Document"
                        sandbox="allow-same-origin"
                        srcDoc={sanitizedHtml}
                        className="w-full flex-1 border-0"
                        style={{ minHeight: '400px' }}
                      />
                      <button
                        onClick={scrollToTop}
                        className="absolute bottom-4 right-4 p-2 bg-white border border-gray-200 rounded-lg shadow-md hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors z-10"
                        title="Scroll to top"
                      >
                        <ArrowUp size={16} />
                      </button>
                    </>
                  ) : contentData?.content ? (
                    <>
                      <div
                        ref={contentRef}
                        className="flex-1 overflow-y-auto px-6 py-5"
                      >
                        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
                          {contentData.content}
                        </pre>
                        {contentData.truncated && (
                          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                            Document was truncated ({(contentData.char_count / 1000).toFixed(0)}k chars shown).
                            View the full document on SEC.gov.
                          </div>
                        )}
                      </div>
                      <button
                        onClick={scrollToTop}
                        className="absolute bottom-4 right-4 p-2 bg-white border border-gray-200 rounded-lg shadow-md hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Scroll to top"
                      >
                        <ArrowUp size={16} />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
                      Could not load document content.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
