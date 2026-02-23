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

export const uploadPortfolio = (name, description, file) => {
  const formData = new FormData()
  formData.append('name', name)
  if (description) formData.append('description', description)
  formData.append('file', file)
  return api.post('/portfolios/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
