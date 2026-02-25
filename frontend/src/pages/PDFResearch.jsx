import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { uploadPdf, searchPdf, summarizePdf, getPageContent } from '../api/pdfResearch'
import EmptyState from '../components/common/EmptyState'
import {
  FileSearch, Upload, Search, Loader2, Sparkles, X, ChevronLeft, ChevronRight,
  BookOpen, Tag, ArrowUp, Hash, FileText, Zap,
} from 'lucide-react'
import clsx from 'clsx'

export default function PDFResearch() {
  // Document state
  const [doc, setDoc] = useState(null)           // uploaded doc metadata
  const [pageText, setPageText] = useState('')    // current page text
  const [currentPage, setCurrentPage] = useState(1)
  const [loadingPage, setLoadingPage] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  // AI summarize state
  const [keywords, setKeywords] = useState('')
  const [focusQuery, setFocusQuery] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [showAiPanel, setShowAiPanel] = useState(false)

  const contentRef = useRef(null)
  const searchInputRef = useRef(null)

  // ─── Upload mutation ───────────────────────────────────────────────
  const upload = useMutation({
    mutationFn: uploadPdf,
    onSuccess: (data) => {
      setDoc(data)
      setCurrentPage(1)
      setSearchResults(null)
      setAiResult(null)
      setShowAiPanel(false)
      setSearchQuery('')
      setKeywords('')
      setFocusQuery('')
    },
  })

  // ─── Search mutation ───────────────────────────────────────────────
  const search = useMutation({
    mutationFn: ({ docId, query }) => searchPdf(docId, query),
    onSuccess: (data) => {
      setSearchResults(data)
      setActiveMatchIndex(0)
      // Jump to first match's page
      if (data.matches?.length > 0) {
        const firstPage = data.matches[0].page
        if (firstPage !== currentPage) {
          setCurrentPage(firstPage)
        }
      }
    },
  })

  // ─── Summarize mutation ────────────────────────────────────────────
  const summarize = useMutation({
    mutationFn: ({ docId, kws, focus }) => summarizePdf(docId, kws, focus),
    onSuccess: (data) => {
      setAiResult(data.result)
      setShowAiPanel(true)
    },
  })

  // ─── Load page content when page changes ───────────────────────────
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    setLoadingPage(true)
    getPageContent(doc.doc_id, currentPage)
      .then((data) => { if (!cancelled) setPageText(data.text) })
      .catch(() => { if (!cancelled) setPageText('') })
      .finally(() => { if (!cancelled) setLoadingPage(false) })
    return () => { cancelled = true }
  }, [doc, currentPage])

  // ─── Dropzone ──────────────────────────────────────────────────────
  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) upload.mutate(accepted[0])
  }, [upload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    disabled: upload.isPending,
  })

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleSearch = (e) => {
    e.preventDefault()
    if (!searchQuery.trim() || !doc) return
    search.mutate({ docId: doc.doc_id, query: searchQuery.trim() })
  }

  const handleSummarize = (e) => {
    e.preventDefault()
    if (!keywords.trim() || !doc) return
    const kws = keywords.split(',').map(k => k.trim()).filter(Boolean)
    summarize.mutate({ docId: doc.doc_id, kws, focus: focusQuery.trim() })
  }

  const jumpToMatch = (index) => {
    if (!searchResults?.matches) return
    const match = searchResults.matches[index]
    if (match) {
      setActiveMatchIndex(index)
      if (match.page !== currentPage) setCurrentPage(match.page)
    }
  }

  const scrollToTop = () => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }

  // Ctrl+K shortcut for search
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

  // ─── Highlight search term in page text ────────────────────────────
  const renderHighlightedText = (text, query) => {
    if (!query || !text) return text
    try {
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
      const parts = text.split(regex)
      return parts.map((part, i) =>
        regex.test(part)
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">{part}</mark>
          : part
      )
    } catch {
      return text
    }
  }

  // ─── Page navigation helpers ───────────────────────────────────────
  const canPrev = currentPage > 1
  const canNext = doc && currentPage < doc.page_count

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <FileSearch size={22} className="text-emerald-600" />
          PDF Research
        </h2>
        {doc && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FileText size={14} />
            <span className="font-medium text-gray-700 truncate max-w-xs">{doc.filename}</span>
            <span>&middot; {doc.page_count} pages &middot; {(doc.total_chars / 1000).toFixed(0)}k chars</span>
          </div>
        )}
      </div>

      {/* Upload area (when no doc loaded) */}
      {!doc ? (
        <div className="flex-1 flex items-center justify-center">
          <div
            {...getRootProps()}
            className={clsx(
              'w-full max-w-xl border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors',
              isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50',
              upload.isPending && 'opacity-60 cursor-wait'
            )}
          >
            <input {...getInputProps()} />
            {upload.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={40} className="animate-spin text-emerald-500" />
                <p className="text-sm text-gray-600">Extracting text from PDF...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload size={40} className="text-gray-400" />
                <div>
                  <p className="text-lg font-medium text-gray-700">
                    {isDragActive ? 'Drop your PDF here' : 'Upload a PDF document'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Drag & drop or click to browse. Max 50 MB.
                  </p>
                </div>
              </div>
            )}
            {upload.isError && (
              <p className="mt-4 text-sm text-red-600">
                {upload.error?.response?.data?.detail || 'Failed to upload PDF'}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Main split layout */
        <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">

          {/* Left Panel: Search & Navigation */}
          <div className="col-span-4 xl:col-span-3 flex flex-col min-h-0 gap-3">

            {/* Upload new */}
            <div
              {...getRootProps()}
              className={clsx(
                'flex-shrink-0 border border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors text-sm',
                isDragActive ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50',
                upload.isPending && 'opacity-60 cursor-wait'
              )}
            >
              <input {...getInputProps()} />
              {upload.isPending ? (
                <span className="text-gray-500 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Processing...</span>
              ) : (
                <span className="text-gray-500 flex items-center justify-center gap-2"><Upload size={14} /> Upload different PDF</span>
              )}
            </div>

            {/* Keyword Search */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                <Search size={14} className="text-emerald-600" /> Keyword Search
              </h3>
              <form onSubmit={handleSearch} className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search keywords... (Ctrl+K)"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!searchQuery.trim() || search.isPending}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {search.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Search Document
                </button>
              </form>
            </div>

            {/* Search Results */}
            {searchResults && (
              <div className="bg-white rounded-xl border border-gray-200 flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <Hash size={14} className="text-emerald-600" />
                    {searchResults.total_matches} match{searchResults.total_matches !== 1 ? 'es' : ''}
                  </span>
                  <button onClick={() => setSearchResults(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {searchResults.matches?.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">No matches found.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {searchResults.matches.map((match, i) => (
                        <button
                          key={i}
                          onClick={() => jumpToMatch(i)}
                          className={clsx(
                            'w-full text-left px-4 py-3 transition-colors',
                            i === activeMatchIndex
                              ? 'bg-emerald-50 border-l-2 border-emerald-600'
                              : 'hover:bg-gray-50 border-l-2 border-transparent'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Page {match.page}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-3">{match.snippet}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Summarize */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                <Sparkles size={14} className="text-purple-600" /> AI Summarize
              </h3>
              <form onSubmit={handleSummarize} className="space-y-2">
                <div className="relative">
                  <Tag size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="Keywords (comma-separated)"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <input
                  type="text"
                  value={focusQuery}
                  onChange={(e) => setFocusQuery(e.target.value)}
                  placeholder="What are you looking for? (optional)"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!keywords.trim() || summarize.isPending}
                  className="w-full flex items-center justify-center gap-1.5 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {summarize.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
                  ) : (
                    <><Zap size={14} /> Summarize</>
                  )}
                </button>
              </form>
              {summarize.isError && (
                <p className="mt-2 text-xs text-red-600">
                  {summarize.error?.response?.data?.detail || 'Summarization failed'}
                </p>
              )}
            </div>
          </div>

          {/* Right Panel: Document Viewer + AI Results */}
          <div className="col-span-8 xl:col-span-9 flex flex-col min-h-0 gap-3">

            {/* AI Results Panel */}
            {showAiPanel && aiResult && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex-shrink-0 max-h-[45%] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-purple-900 flex items-center gap-1.5">
                    <Sparkles size={14} /> AI Research Summary
                  </h4>
                  <button
                    onClick={() => setShowAiPanel(false)}
                    className="p-1 rounded hover:bg-purple-100 text-purple-400 hover:text-purple-700"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Summary */}
                <p className="text-sm text-gray-800 mb-3">{aiResult.summary}</p>

                {/* Sections overview */}
                {aiResult.sections_overview && (
                  <p className="text-xs text-purple-700 italic mb-3">{aiResult.sections_overview}</p>
                )}

                {/* Key Findings */}
                {aiResult.key_findings?.length > 0 && (
                  <div className="mb-3">
                    <h5 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">Key Findings</h5>
                    <div className="space-y-2">
                      {aiResult.key_findings.map((f, i) => (
                        <div key={i} className="bg-white rounded-lg border border-purple-100 p-3">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 shrink-0">
                              Page {f.page}
                            </span>
                            <div>
                              <p className="text-sm text-gray-800 font-medium">{f.finding}</p>
                              {f.relevance && <p className="text-xs text-gray-500 mt-0.5">{f.relevance}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Points */}
                {aiResult.data_points?.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">Data Points</h5>
                    <div className="flex flex-wrap gap-2">
                      {aiResult.data_points.map((dp, i) => (
                        <div key={i} className="bg-white rounded-lg border border-purple-200 px-3 py-1.5">
                          <span className="text-xs text-gray-500">{dp.label}: </span>
                          <span className="text-sm font-mono font-semibold text-gray-900">{dp.value}</span>
                          {dp.page && <span className="text-xs text-purple-400 ml-1">(p.{dp.page})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Document Viewer */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden min-h-0 flex flex-col relative">
              {/* Page navigation bar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Page <span className="font-semibold text-gray-900">{currentPage}</span> of {doc.page_count}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={!canPrev}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {/* Page jump input */}
                  <input
                    type="number"
                    min={1}
                    max={doc.page_count}
                    value={currentPage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (val >= 1 && val <= doc.page_count) setCurrentPage(val)
                    }}
                    className="w-14 text-center text-sm border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => setCurrentPage(p => Math.min(doc.page_count, p + 1))}
                    disabled={!canNext}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {searchResults && searchResults.total_matches > 0 && (
                  <div className="flex items-center gap-1 text-xs text-emerald-700">
                    <span className="font-medium">
                      {searchResults.matches.filter(m => m.page === currentPage).length} match{searchResults.matches.filter(m => m.page === currentPage).length !== 1 ? 'es' : ''} on this page
                    </span>
                  </div>
                )}
              </div>

              {/* Page content */}
              {loadingPage ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm gap-2">
                  <Loader2 size={16} className="animate-spin" /> Loading page...
                </div>
              ) : (
                <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-5">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
                    {searchResults && searchQuery
                      ? renderHighlightedText(pageText, searchQuery)
                      : pageText || <span className="text-gray-400 italic">No text content on this page.</span>
                    }
                  </pre>
                </div>
              )}

              {/* Scroll to top */}
              <button
                onClick={scrollToTop}
                className="absolute bottom-4 right-4 p-2 bg-white border border-gray-200 rounded-lg shadow-md hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-colors"
                title="Scroll to top"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
