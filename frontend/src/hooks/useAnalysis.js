import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as analysisApi from '../api/analysis'

export function useLatestAnalysis(portfolioId) {
  return useQuery({
    queryKey: ['analysis', 'latest', portfolioId],
    queryFn: () => analysisApi.getLatestAnalysis(portfolioId),
    enabled: !!portfolioId,
    retry: false,
  })
}

export function useAnalysisHistory(portfolioId) {
  return useQuery({
    queryKey: ['analysis', 'history', portfolioId],
    queryFn: () => analysisApi.getAnalysisHistory(portfolioId),
    enabled: !!portfolioId,
  })
}

export function useTriggerAnalysis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: analysisApi.triggerAnalysis,
    onSuccess: (data, portfolioId) => {
      qc.invalidateQueries({ queryKey: ['analysis', 'latest', portfolioId] })
      qc.invalidateQueries({ queryKey: ['analysis', 'history', portfolioId] })
    },
  })
}
