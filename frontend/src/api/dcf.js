import api from './client'

export const fetchDCFFinancials = (ticker) =>
  api.get(`/dcf/financials/${ticker}`).then(r => r.data)

export const runDCFCalculation = (inputs) =>
  api.post('/dcf/calculate', inputs).then(r => r.data)

export const getDCFHistory = (ticker = null, limit = 50) =>
  api.get('/dcf/history', { params: { ticker, limit } }).then(r => r.data)

export const getDCFValuation = (id) =>
  api.get(`/dcf/${id}`).then(r => r.data)

export const deleteDCFValuation = (id) =>
  api.delete(`/dcf/${id}`)
