import api from './client'

export const getQuotes = (portfolioId) =>
  api.get('/market-data/quotes', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getNews = (portfolioId) =>
  api.get('/market-data/news', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getPredictions = () =>
  api.get('/market-data/predictions').then(r => r.data)

export const getEconomicIndicators = () =>
  api.get('/market-data/economic').then(r => r.data)

export const getTechnicals = (portfolioId) =>
  api.get('/market-data/technicals', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getFundamentals = (portfolioId) =>
  api.get('/market-data/fundamentals', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getOptionsData = (portfolioId) =>
  api.get('/market-data/options', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getPortfolioRisk = (portfolioId) =>
  api.get('/market-data/risk', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const refreshCache = () =>
  api.post('/market-data/refresh').then(r => r.data)
