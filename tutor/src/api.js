import { humanizeApiError, statusFallback, slugifyUsername, isValidPublicUsername } from './siteUtils.js'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'synapsoul-token'
const LEGACY_TOKEN_KEY = 'learnlab-token'
const ADMIN_OTP_KEY = 'synapsoul-admin-otp'
const LEGACY_ADMIN_OTP_KEY = 'learnlab-admin-otp'

function readKey(...keys) {
  for (const key of keys) {
    const v = localStorage.getItem(key)
    if (v) return v
  }
  return null
}

function writeKey(value, ...keys) {
  for (const key of keys) {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  }
}

export function getToken() {
  return readKey(TOKEN_KEY, LEGACY_TOKEN_KEY)
}

export function setToken(token) {
  if (token) writeKey(token, TOKEN_KEY, LEGACY_TOKEN_KEY)
  else {
    writeKey(null, TOKEN_KEY, LEGACY_TOKEN_KEY)
    clearAdminOtp()
  }
}

export function getAdminOtp() {
  return readKey(ADMIN_OTP_KEY, LEGACY_ADMIN_OTP_KEY)
}

export function setAdminOtp(token) {
  writeKey(token || null, ADMIN_OTP_KEY, LEGACY_ADMIN_OTP_KEY)
}

export function clearAdminOtp() {
  writeKey(null, ADMIN_OTP_KEY, LEGACY_ADMIN_OTP_KEY)
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
  const { timeoutMs, signal, headers: extraHeaders, ...rest } = options
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const adminOtp = getAdminOtp()
  if (adminOtp) headers['X-Admin-Session'] = adminOtp
  const controller = new AbortController()
  let timer
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...rest, headers, signal: controller.signal })
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    const wrapped = new Error(
      aborted
        ? 'The request timed out. Check your connection and try again.'
        : humanizeApiError(err)
    )
    if (aborted) wrapped.code = 'TIMEOUT'
    throw wrapped
  } finally {
    if (timer) clearTimeout(timer)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const fallback = statusFallback(res.status)
    const err = new Error(humanizeApiError({ message: data.error || '' }, fallback))
    err.status = res.status
    err.code = data.code
    err.apiError = data.error || err.message
    err.retryAfter = data.retryAfter
    throw err
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
  const slug = slugifyUsername(username)
  if (!isValidPublicUsername(slug)) {
    return Promise.reject(new Error('Profile not found'))
  }
  return apiFetch(`/api/profile/${encodeURIComponent(slug)}`)
}

export function updateProfile(body) {
  return apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify(body) })
}

export function fetchAuthProviders() {
  return apiFetch('/api/auth/providers')
}

/** Full public profile URL, or null if username is missing or not a valid slug. */
export function publicProfileUrl(username) {
  const slug = slugifyUsername(username)
  if (!isValidPublicUsername(slug)) return null
  const path = `/u/${encodeURIComponent(slug)}`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
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

/** Fire-and-forget Local Learner signal (logged-in website activity only). */
export function observeLearner(body) {
  if (!canSyncProgress()) return Promise.resolve({ ok: false, skipped: true })
  return apiFetch('/api/learner/observe', {
    method: 'POST',
    body: JSON.stringify(body),
  }).catch(() => ({ ok: false }))
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

export function fetchAdminOverview() {
  return apiFetch('/api/admin/overview')
}

export function fetchAdminStudents() {
  return apiFetch('/api/admin/students')
}

export function fetchAdminStudent(id) {
  return apiFetch(`/api/admin/students/${encodeURIComponent(id)}`)
}

export function requestAdminOtp() {
  return apiFetch('/api/admin/otp/request', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 30_000,
  })
}

export function verifyAdminOtp(code) {
  return apiFetch('/api/admin/otp/verify', { method: 'POST', body: JSON.stringify({ code }) })
}

export function logoutAdminOtp() {
  const token = getAdminOtp()
  if (!getToken() || !token) {
    clearAdminOtp()
    return Promise.resolve()
  }
  return apiFetch('/api/admin/otp/logout', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }).finally(() => clearAdminOtp())
}
