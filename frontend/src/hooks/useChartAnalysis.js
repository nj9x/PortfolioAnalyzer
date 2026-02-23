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
