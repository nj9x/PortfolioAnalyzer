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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })
}

export function useUploadPortfolio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description, file }) =>
      portfolioApi.uploadPortfolio(name, description, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })
}

export function useDeletePortfolio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: portfolioApi.deletePortfolio,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })
}

export function useAddHolding(portfolioId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => portfolioApi.addHolding(portfolioId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio', portfolioId] })
      qc.invalidateQueries({ queryKey: ['portfolios'] })
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
