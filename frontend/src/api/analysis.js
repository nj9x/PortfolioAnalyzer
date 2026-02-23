import api from './client'

export const triggerAnalysis = (portfolioId) =>
  api.post(`/analysis/${portfolioId}/analyze`).then(r => r.data)

export const getLatestAnalysis = (portfolioId) =>
  api.get(`/analysis/${portfolioId}/latest`).then(r => r.data)

export const getAnalysisHistory = (portfolioId) =>
  api.get(`/analysis/${portfolioId}/history`).then(r => r.data)

export const getReport = (reportId) =>
  api.get(`/analysis/report/${reportId}`).then(r => r.data)
