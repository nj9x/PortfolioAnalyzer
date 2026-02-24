import { useQuery } from '@tanstack/react-query'
import * as marketApi from '../api/marketData'

export function useQuotes(portfolioId) {
  return useQuery({
    queryKey: ['quotes', portfolioId],
    queryFn: () => marketApi.getQuotes(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useNews(portfolioId) {
  return useQuery({
    queryKey: ['news', portfolioId],
    queryFn: () => marketApi.getNews(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 15 * 60 * 1000,
  })
}

export function usePredictions() {
  return useQuery({
    queryKey: ['predictions'],
    queryFn: marketApi.getPredictions,
    refetchInterval: 10 * 60 * 1000,
  })
}

export function useEconomicIndicators() {
  return useQuery({
    queryKey: ['economic'],
    queryFn: marketApi.getEconomicIndicators,
  })
}

export function useSparklines(portfolioId) {
  return useQuery({
    queryKey: ['sparklines', portfolioId],
    queryFn: () => marketApi.getSparklines(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useTechnicals(portfolioId) {
  return useQuery({
    queryKey: ['technicals', portfolioId],
    queryFn: () => marketApi.getTechnicals(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useFundamentals(portfolioId) {
  return useQuery({
    queryKey: ['fundamentals', portfolioId],
    queryFn: () => marketApi.getFundamentals(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 60 * 60 * 1000,
  })
}

export function useOptionsData(portfolioId) {
  return useQuery({
    queryKey: ['options', portfolioId],
    queryFn: () => marketApi.getOptionsData(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function usePortfolioRisk(portfolioId) {
  return useQuery({
    queryKey: ['risk', portfolioId],
    queryFn: () => marketApi.getPortfolioRisk(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5 * 60 * 1000,
  })
}

// Single-ticker hooks for stock detail page
export function useTickerQuote(ticker) {
  return useQuery({
    queryKey: ['ticker-quote', ticker],
    queryFn: () => marketApi.getTickerQuote(ticker),
    enabled: !!ticker,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useTickerFundamentals(ticker) {
  return useQuery({
    queryKey: ['ticker-fundamentals', ticker],
    queryFn: () => marketApi.getTickerFundamentals(ticker),
    enabled: !!ticker,
    staleTime: 60 * 60 * 1000,
  })
}

export function useTickerTechnicals(ticker) {
  return useQuery({
    queryKey: ['ticker-technicals', ticker],
    queryFn: () => marketApi.getTickerTechnicals(ticker),
    enabled: !!ticker,
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useTickerHistory(ticker, period) {
  return useQuery({
    queryKey: ['ticker-history', ticker, period],
    queryFn: () => marketApi.getTickerHistory(ticker, period),
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000,
  })
}
