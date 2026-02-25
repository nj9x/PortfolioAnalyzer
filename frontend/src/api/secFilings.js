import api from './client'

export const searchFilings = (ticker, filingTypes = '10-K,10-Q,8-K', limit = 20) =>
  api.get('/sec-filings/search', { params: { ticker, filing_types: filingTypes, limit } }).then(r => r.data)

export const getFilingContent = (accession, cik, doc = '') =>
  api.get('/sec-filings/content', { params: { accession, cik, doc } }).then(r => r.data)

export const aiSearchFiling = (accession, cik, query, doc = '') =>
  api.post('/sec-filings/ai-search', { accession, cik, query, doc }).then(r => r.data)
