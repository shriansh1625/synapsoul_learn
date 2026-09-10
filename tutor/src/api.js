import { humanizeApiError, statusFallback } from './siteUtils.js'

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

export function canSyncProgress() {
  return apiEnabled() && isLoggedIn()
}

async function apiFetch(path, options = {}) {
  if (import.meta.env.PROD && !API_BASE) {
    throw new Error('Cloud sync is not configured yet. You can keep working locally.')
  }
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (err) {
    throw new Error(humanizeApiError(err))
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(humanizeApiError({ message: data.error || '' }, statusFallback(res.status)))
  }
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
  return apiFetch(`/api/profile/${encodeURIComponent(username)}`)
}

export function updateProfile(body) {
  return apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify(body) })
}

export function fetchAuthProviders() {
  return apiFetch('/api/auth/providers')
}

export function publicProfileUrl(username) {
  const handle = username || 'your-handle'
  if (typeof window === 'undefined') return `/u/${handle}`
  return `${window.location.origin}/u/${handle}`
}

export function oauthStartUrl(provider, { connect = false } = {}) {
  const params = new URLSearchParams()
  if (connect) {
    const token = getToken()
    if (token) {
      params.set('connect', '1')
      params.set('token', token)
    }
  }
  const q = params.toString()
  return `${API_BASE}/api/auth/${provider}${q ? `?${q}` : ''}`
}

export function fetchBrain() {
  return apiFetch('/api/brain')
}

export function putBrain(state) {
  return apiFetch('/api/brain', { method: 'PUT', body: JSON.stringify({ state }) })
}

export function observeBrain(event) {
  return apiFetch('/api/brain/observe', { method: 'POST', body: JSON.stringify(event) })
}

export function fetchCoachNote(body) {
  return apiFetch('/api/llm/coach', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchLlmHint(body) {
  return apiFetch('/api/llm/hint', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchLlmReflect(body) {
  return apiFetch('/api/llm/reflect', { method: 'POST', body: JSON.stringify(body) })
}

export function fetchLlmStatus() {
  return apiFetch('/api/llm/status')
}

export function reactToInteraction(interactionId, reaction) {
  return apiFetch('/api/learning/react', {
    method: 'POST',
    body: JSON.stringify({ interactionId, reaction }),
  })
}

export function fetchLearningStats() {
  return apiFetch('/api/learning/stats')
}
