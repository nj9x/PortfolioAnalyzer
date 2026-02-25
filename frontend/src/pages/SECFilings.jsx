import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { searchFilings, getFilingContent, aiSearchFiling } from '../api/secFilings'
import EmptyState from '../components/common/EmptyState'
import {
  FileText, Search, Loader2, ExternalLink, Sparkles, ChevronRight,
  X, ArrowUp, Filter
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
  const contentRef = useRef(null)
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

  const handleSearch = (e) => {
    e.preventDefault()
    if (!ticker.trim()) return
    setSubmittedTicker(ticker.trim().toUpperCase())
    setSelectedFiling(null)
    setAiResults(null)
    setShowAiPanel(false)
  }

  const handleFilingClick = (filing) => {
    setSelectedFiling(filing)
    setAiResults(null)
    setShowAiPanel(false)
    // Scroll content to top
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
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [])

  const filings = filingsData?.filings || []
  const companyName = filingsData?.company_name || ''

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)]  flex flex-col">
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

          {/* Right Panel: Document Preview + AI Search */}
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
                {/* Document Header + AI Search Bar */}
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
                    <a
                      href={selectedFiling.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      View on SEC <ExternalLink size={12} />
                    </a>
                  </div>

                  {/* AI Search */}
                  <form onSubmit={handleAiSearch} className="flex gap-2">
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

                  {aiSearch.isError && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
                      {aiSearch.error?.response?.data?.detail || 'AI search failed'}
                    </div>
                  )}
                </div>

                {/* AI Results Panel (overlay on top of document) */}
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

                    {/* Key Figures */}
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

                    {/* Excerpts */}
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

                {/* Document Content */}
                <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden min-h-0 relative">
                  {contentLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
                      <Loader2 size={16} className="animate-spin" /> Loading document...
                    </div>
                  ) : contentData?.content ? (
                    <>
                      <div
                        ref={contentRef}
                        className="h-full overflow-y-auto px-6 py-5"
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
                      {/* Scroll to top button */}
                      <button
                        onClick={scrollToTop}
                        className="absolute bottom-4 right-4 p-2 bg-white border border-gray-200 rounded-lg shadow-md hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
                        title="Scroll to top"
                      >
                        <ArrowUp size={16} />
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
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
