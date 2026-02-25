import api from './client'

export const uploadPdf = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/pdf-research/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then(r => r.data)
}

export const searchPdf = (docId, query, contextChars = 150) =>
  api.get('/pdf-research/search', { params: { doc_id: docId, q: query, context_chars: contextChars } }).then(r => r.data)

export const getPageContent = (docId, page) =>
  api.get('/pdf-research/page', { params: { doc_id: docId, page } }).then(r => r.data)

export const summarizePdf = (docId, keywords, focus = '') =>
  api.post('/pdf-research/summarize', { doc_id: docId, keywords, focus }).then(r => r.data)
