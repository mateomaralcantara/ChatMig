import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export const plan = (payload: any) => api.post('/chat/plan', payload).then(r => r.data)
export const evaluate = (payload: any) => api.post('/chat/evaluate', payload).then(r => r.data)
export const abgenerate = (payload: any) => api.post('/ab/generate', payload).then(r => r.data)
export const logProgress = (payload: any) => api.post('/progress/log', payload).then(r => r.data)
export default api

