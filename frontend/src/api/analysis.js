import api from './client'

// Analysis can take up to 5 minutes (market data + Claude generation)
export const triggerAnalysis = (portfolioId) =>
  api.post(`/analysis/${portfolioId}/analyze`, null, { timeout: 360000 }).then(r => r.data)

export const getLatestAnalysis = (portfolioId) =>
  api.get(`/analysis/${portfolioId}/latest`).then(r => r.data)

export const getAnalysisHistory = (portfolioId) =>
  api.get(`/analysis/${portfolioId}/history`).then(r => r.data)

export const getReport = (reportId) =>
  api.get(`/analysis/report/${reportId}`).then(r => r.data)
