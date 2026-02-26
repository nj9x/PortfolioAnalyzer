import api from './client'

export const listPortfolios = () => api.get('/portfolios/').then(r => r.data)

export const getPortfolio = (id) => api.get(`/portfolios/${id}`).then(r => r.data)

export const createPortfolio = (data) => api.post('/portfolios/', data).then(r => r.data)

export const updatePortfolio = (id, data) => api.put(`/portfolios/${id}`, data).then(r => r.data)

export const deletePortfolio = (id) => api.delete(`/portfolios/${id}`)

export const addHolding = (portfolioId, data) =>
  api.post(`/portfolios/${portfolioId}/holdings`, data).then(r => r.data)

export const updateHolding = (portfolioId, holdingId, data) =>
  api.put(`/portfolios/${portfolioId}/holdings/${holdingId}`, data).then(r => r.data)

export const deleteHolding = (portfolioId, holdingId) =>
  api.delete(`/portfolios/${portfolioId}/holdings/${holdingId}`)

export const uploadPortfolio = (name, description, file, clientName, category) => {
  const formData = new FormData()
  formData.append('name', name)
  if (description) formData.append('description', description)
  if (clientName) formData.append('client_name', clientName)
  formData.append('category', category || 'balanced')
  formData.append('file', file)
  return api.post('/portfolios/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getDashboardOverview = () =>
  api.get('/portfolios/dashboard-overview').then(r => r.data)

export const getPortfolioAnalytics = (id) =>
  api.get(`/portfolios/${id}/analytics`).then(r => r.data)
