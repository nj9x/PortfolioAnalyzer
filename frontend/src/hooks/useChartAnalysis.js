import { useState, useEffect } from 'react'
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
