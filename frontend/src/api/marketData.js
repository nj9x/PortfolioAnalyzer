import api from './client'

export const getQuotes = (portfolioId) =>
  api.get('/market-data/quotes', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getNews = (portfolioId) =>
  api.get('/market-data/news', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getPredictions = () =>
  api.get('/market-data/predictions').then(r => r.data)

export const getEconomicIndicators = () =>
  api.get('/market-data/economic').then(r => r.data)

export const getSparklines = (portfolioId) =>
  api.get('/market-data/sparklines', { params: { portfolio_id: portfolioId } }).then(r => r.data)

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

// Single-ticker endpoints for stock detail page
export const getTickerQuote = (ticker) =>
  api.get('/market-data/quotes', { params: { tickers: ticker } }).then(r => r.data)

export const getTickerFundamentals = (ticker) =>
  api.get('/market-data/fundamentals', { params: { tickers: ticker } }).then(r => r.data)

export const getTickerTechnicals = (ticker) =>
  api.get('/market-data/technicals', { params: { tickers: ticker } }).then(r => r.data)

export const getTickerHistory = (ticker, period = '1y') =>
  api.get('/market-data/history', { params: { ticker, period } }).then(r => r.data)

export const getTickerRisk = (ticker) =>
  api.get('/market-data/ticker-risk', { params: { ticker } }).then(r => r.data)

export const getSecFilings = (portfolioId) =>
  api.get('/market-data/sec-filings', { params: { portfolio_id: portfolioId } }).then(r => r.data)

export const getTickerSecFilings = (ticker) =>
  api.get('/market-data/sec-filings', { params: { tickers: ticker } }).then(r => r.data)
