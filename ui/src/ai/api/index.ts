import axios from 'axios'

// Configuration d'axios avec les variables d'environnement
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:4000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptors pour la gestion des erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export const apiClient = api

export const wsUrl = (path: string) => {
  const baseUrl = import.meta.env.VITE_WS_BASE || 'ws://localhost:3010'
  return `${baseUrl}${path}`
}