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
  const transcriptRef = useRef('')

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const reset = useCallback(() => {
    setStatus('idle')
    setTranscript('')
    setResult(null)
    setError(null)
    transcriptRef.current = ''
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch (e) { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Try Chrome.')
      setStatus('error')
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
    recognition.continuous = false
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
        setError('No speech detected. Please try again.')
        setStatus('error')
        return
      }

      setTranscript(finalTranscript)
      setStatus('processing')

      try {
        const parsed = await chartApi.parseVoiceCommand(finalTranscript)
        setResult(parsed)
        setStatus('done')
      } catch (err) {
        setError(err?.response?.data?.detail || 'Failed to parse voice command')
        setStatus('error')
      }
    }

    recognition.onerror = (event) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (event.error === 'aborted') {
        setStatus('idle')
        return
      }
      if (event.error === 'no-speech') {
        setError('No speech detected. Please try again.')
      } else if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please allow microphone access.')
      } else {
        setError(`Speech recognition error: ${event.error}`)
      }
      setStatus('error')
    }

    recognition.start()

    // Safety timeout: stop listening after 10 seconds
    timeoutRef.current = setTimeout(() => {
      if (recognitionRef.current) recognitionRef.current.stop()
    }, 10000)
  }, [isSupported])

  const stopListening = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (recognitionRef.current) recognitionRef.current.stop()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
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
