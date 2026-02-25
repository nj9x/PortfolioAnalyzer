import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as chartApi from '../api/chartAnalysis'

export function useChartHistory() {
  return useQuery({
    queryKey: ['chart-analysis', 'history'],
    queryFn: () => chartApi.getChartHistory(),
  })
}

export function useChartAnalysis(id) {
  return useQuery({
    queryKey: ['chart-analysis', id],
    queryFn: () => chartApi.getChartAnalysis(id),
    enabled: !!id,
  })
}

export function useAnalyzeChart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, analysisType, userNotes }) =>
      chartApi.analyzeChart(file, analysisType, userNotes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chart-analysis', 'history'] })
    },
  })
}

export function useDeleteChartAnalysis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: chartApi.deleteChartAnalysis,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chart-analysis', 'history'] })
    },
  })
}

export function useAnalyzeTicker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticker, userNotes }) =>
      chartApi.analyzeTicker(ticker, userNotes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chart-analysis', 'history'] })
    },
  })
}

export function useTickerSearch(query) {
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  return useQuery({
    queryKey: ['ticker-search', debouncedQuery],
    queryFn: () => chartApi.searchTickers(debouncedQuery),
    enabled: debouncedQuery.length >= 1,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  })
}

/**
 * Voice command hook: captures speech via Web Speech API, sends transcript
 * to backend for Claude intent parsing, returns {ticker, notes, action}.
 *
 * State machine: idle → listening → processing → done/error → idle
 */
export function useVoiceCommand() {
  const [status, setStatus] = useState('idle')       // idle | listening | processing | done | error
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState(null)          // {ticker, notes, action, message?}
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const timeoutRef = useRef(null)
  const autoDismissRef = useRef(null)
  const transcriptRef = useRef('')
  const retryCountRef = useRef(0)
  const maxRetries = 1   // auto-retry once on no-speech

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const reset = useCallback(() => {
    setStatus('idle')
    setTranscript('')
    setResult(null)
    setError(null)
    transcriptRef.current = ''
    retryCountRef.current = 0
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch (e) { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  // Auto-dismiss errors after 4 seconds
  const showError = useCallback((msg) => {
    setError(msg)
    setStatus('error')
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    autoDismissRef.current = setTimeout(() => {
      setStatus((s) => s === 'error' ? 'idle' : s)
      setError((e) => e === msg ? null : e)
    }, 4000)
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) {
      showError('Speech recognition is not supported in this browser. Try Chrome.')
      return
    }

    setTranscript('')
    setResult(null)
    setError(null)
    transcriptRef.current = ''
    setStatus('listening')

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true      // keep listening through pauses
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      const current = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('')
      setTranscript(current)
      transcriptRef.current = current
    }

    recognition.onend = async () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      const finalTranscript = transcriptRef.current.trim()

      if (!finalTranscript) {
        // Auto-retry once before showing error
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++
          setTranscript('')
          transcriptRef.current = ''
          try {
            const retry = new SpeechRecognition()
            recognitionRef.current = retry
            retry.lang = 'en-US'
            retry.interimResults = true
            retry.continuous = true
            retry.maxAlternatives = 1
            retry.onresult = recognition.onresult
            retry.onend = recognition.onend
            retry.onerror = recognition.onerror
            retry.start()
            timeoutRef.current = setTimeout(() => {
              if (recognitionRef.current) recognitionRef.current.stop()
            }, 15000)
            return
          } catch (e) { /* fall through to error */ }
        }
        showError('No speech detected. Please try again.')
        return
      }

      retryCountRef.current = 0
      setTranscript(finalTranscript)
      setStatus('processing')

      try {
        const parsed = await chartApi.parseVoiceCommand(finalTranscript)
        setResult(parsed)
        setStatus('done')
      } catch (err) {
        showError(err?.response?.data?.detail || 'Failed to parse voice command')
      }
    }

    recognition.onerror = (event) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (event.error === 'aborted') {
        setStatus('idle')
        return
      }
      // On no-speech, auto-retry once before showing error
      if (event.error === 'no-speech') {
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++
          setTranscript('')
          transcriptRef.current = ''
          try {
            const retry = new SpeechRecognition()
            recognitionRef.current = retry
            retry.lang = 'en-US'
            retry.interimResults = true
            retry.continuous = true
            retry.maxAlternatives = 1
            retry.onresult = recognition.onresult
            retry.onend = recognition.onend
            retry.onerror = recognition.onerror
            retry.start()
            timeoutRef.current = setTimeout(() => {
              if (recognitionRef.current) recognitionRef.current.stop()
            }, 15000)
            return
          } catch (e) { /* fall through to error */ }
        }
        showError('No speech detected. Please try again.')
      } else if (event.error === 'not-allowed') {
        showError('Microphone permission denied. Please allow microphone access.')
      } else {
        showError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.start()

    // Safety timeout: stop listening after 15 seconds
    timeoutRef.current = setTimeout(() => {
      if (recognitionRef.current) recognitionRef.current.stop()
    }, 15000)
  }, [isSupported, showError])

  const stopListening = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    retryCountRef.current = maxRetries  // prevent retry when user manually stops
    if (recognitionRef.current) recognitionRef.current.stop()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch (e) { /* ignore */ }
      }
    }
  }, [])

  return {
    status,
    transcript,
    result,
    error,
    isSupported,
    startListening,
    stopListening,
    reset,
  }
}
