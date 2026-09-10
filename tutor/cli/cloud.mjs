import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const SYNC_DIR = join(DATA_DIR, 'sync')
const AUTH_PATH = join(SYNC_DIR, 'auth.json')

export const PRODUCTION_API = 'https://learnerslab.onrender.com'
export const PRODUCTION_SITE = 'https://tutor-alpha-sandy.vercel.app'

function loadDotEnvFiles() {
  const files = [
    join(__dirname, '..', '.env'),
    join(__dirname, '..', '..', '.env'),
  ]
  for (const file of files) {
    if (!existsSync(file)) continue
    try {
      const text = readFileSync(file, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 1) continue
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (process.env[key] == null || process.env[key] === '') process.env[key] = value
      }
    } catch {
      /* ignore unreadable env files */
    }
  }
}

loadDotEnvFiles()

export function getApiBase() {
  return String(process.env.LEARNLAB_API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '')
}

export function resolveSyncApiBase({ login } = {}) {
  return getApiBase() || (login ? PRODUCTION_API : '')
}

export function loadSavedToken() {
  if (process.env.LEARNLAB_TOKEN) return process.env.LEARNLAB_TOKEN
  if (!existsSync(AUTH_PATH)) return null
  try {
    const data = JSON.parse(readFileSync(AUTH_PATH, 'utf8'))
    return data.token || null
  } catch {
    return null
  }
}

export function saveToken(token, email) {
  if (!existsSync(SYNC_DIR)) mkdirSync(SYNC_DIR, { recursive: true })
  writeFileSync(
    AUTH_PATH,
    JSON.stringify({ token, email: email || null, saved_at: new Date().toISOString() }, null, 2) + '\n',
    'utf8'
  )
}

async function apiFetch(apiBase, path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return data
}

export async function loginToApi(email, password, apiBase) {
  const base = apiBase || resolveSyncApiBase({ login: true })
  if (!base) {
    throw new Error(`Set LEARNLAB_API_URL=${PRODUCTION_API} or sign in at ${PRODUCTION_SITE}`)
  }
  const data = await apiFetch(base, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  if (!data.token) throw new Error('Login did not return a token')
  return { token: data.token, user: data.user, apiBase: base }
}

export async function pushProgressAndBrain({ apiBase, token, progress, brain }) {
  const base = apiBase || getApiBase()
  if (!base) throw new Error('LEARNLAB_API_URL is not set')
  if (!token) throw new Error('Not signed in')

  const brainState = brain?.state || brain || progress?.studentMemory?.brain || null
  await apiFetch(base, '/api/progress/sync', {
    method: 'PUT',
    token,
    body: {
      session: progress?.session || null,
      completedModules: progress?.completedModules || {},
      decisions: progress?.decisions || {},
      scores: progress?.scores || {},
      portfolio: progress?.portfolio || [],
      studentMemory: progress?.studentMemory || {},
      brain: brainState,
    },
  })
  if (brainState && typeof brainState === 'object') {
    await apiFetch(base, '/api/brain', {
      method: 'PUT',
      token,
      body: { state: brainState },
    }).catch(() => {})
  }
  return { ok: true, api: base }
}
