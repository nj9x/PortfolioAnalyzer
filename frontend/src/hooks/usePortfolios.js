import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as portfolioApi from '../api/portfolios'

export function usePortfolios() {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: portfolioApi.listPortfolios,
  })
}

export function usePortfolio(id) {
  return useQuery({
    queryKey: ['portfolio', id],
    queryFn: () => portfolioApi.getPortfolio(id),
    enabled: !!id,
  })
}

export function useCreatePortfolio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: portfolioApi.createPortfolio,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
  })
}

export function useUploadPortfolio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description, file, clientName, category }) =>
      portfolioApi.uploadPortfolio(name, description, file, clientName, category),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
  })
}

export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: portfolioApi.getDashboardOverview,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  })
}

export function useDeletePortfolio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: portfolioApi.deletePortfolio,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
  })
}

export function useAddHolding(portfolioId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => portfolioApi.addHolding(portfolioId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] })
    },
  })
}

export function useDeleteHolding(portfolioId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (holdingId) => portfolioApi.deleteHolding(portfolioId, holdingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      qc.invalidateQueries({ queryKey: ['portfolios'] })
    },
  })
}
