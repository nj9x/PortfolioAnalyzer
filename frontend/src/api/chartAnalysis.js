import api from './client'

export const analyzeChart = (file, analysisType = 'technical', userNotes = '') => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('analysis_type', analysisType)
  formData.append('user_notes', userNotes)
  return api.post('/chart-analysis/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getChartAnalysis = (id) =>
  api.get(`/chart-analysis/${id}`).then(r => r.data)

export const getChartHistory = (limit = 50) =>
  api.get('/chart-analysis/history', { params: { limit } }).then(r => r.data)

export const deleteChartAnalysis = (id) =>
  api.delete(`/chart-analysis/${id}`)

export const getChartImageUrl = (id) => `/api/v1/chart-analysis/image/${id}`

export const analyzeTicker = (ticker, userNotes = '') =>
  api.post('/chart-analysis/analyze-ticker', { ticker, user_notes: userNotes }).then(r => r.data)

export const searchTickers = (query) =>
  api.get('/chart-analysis/search-tickers', { params: { q: query } }).then(r => r.data)

export const parseVoiceCommand = (transcript) =>
  api.post('/chart-analysis/parse-voice', { transcript }).then(r => r.data)
