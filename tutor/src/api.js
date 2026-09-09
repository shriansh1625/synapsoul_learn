const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'learnlab-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn() {
  return !!getToken()
}

export function apiEnabled() {
  return !!API_BASE || import.meta.env.DEV
}

async function apiFetch(path, options = {}) {
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('Cloud API not configured. Set VITE_API_URL on Vercel.')
  }
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export function register(body) {
  return apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body) })
}

export function login(body) {
  return apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchMe() {
  return apiFetch('/api/auth/me')
}

export function fetchProgress() {
  return apiFetch('/api/progress')
}

export function updateSession(body) {
  return apiFetch('/api/progress/session', { method: 'PUT', body: JSON.stringify(body) })
}

export function completeModule(body) {
  return apiFetch('/api/progress/module-complete', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchLeaderboard() {
  return apiFetch('/api/leaderboard')
}

export function fetchPublicProfile(username) {
  return apiFetch(`/api/profile/${username}`)
}
