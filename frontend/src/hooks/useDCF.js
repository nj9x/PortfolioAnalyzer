import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as dcfApi from '../api/dcf'

export function useDCFFinancials(ticker) {
  return useQuery({
    queryKey: ['dcf', 'financials', ticker],
    queryFn: () => dcfApi.fetchDCFFinancials(ticker),
    enabled: false,  // manual trigger only
    staleTime: 5 * 60 * 1000,
  })
}

export function useRunDCF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dcfApi.runDCFCalculation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dcf', 'history'] })
    },
  })
}

export function useDCFHistory(ticker = null) {
  return useQuery({
    queryKey: ['dcf', 'history', ticker],
    queryFn: () => dcfApi.getDCFHistory(ticker),
  })
}

export function useDCFValuation(id) {
  return useQuery({
    queryKey: ['dcf', id],
    queryFn: () => dcfApi.getDCFValuation(id),
    enabled: !!id,
  })
}

export function useDeleteDCF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dcfApi.deleteDCFValuation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dcf', 'history'] })
    },
  })
}
