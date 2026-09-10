import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import {
  PRODUCTION_API,
  PRODUCTION_SITE,
  authFile,
  learnlabHome,
  defaultApiBase,
  envFirst,
} from './paths.mjs'

export { PRODUCTION_API, PRODUCTION_SITE }

const __dirname = dirname(fileURLToPath(import.meta.url))
const AUTH_PATH = authFile()

function loadDotEnvFiles() {
  const files = [
    join(__dirname, '..', '.env'),
    join(__dirname, '..', '..', '.env'),
    join(learnlabHome(), '.env'),
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
  return defaultApiBase()
}

export function openSite(url = PRODUCTION_SITE) {
  const plat = process.platform
  try {
    if (plat === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    else if (plat === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    /* ignore */
  }
}

export function resolveSyncApiBase({ login } = {}) {
  return getApiBase() || (login ? PRODUCTION_API : '')
}

export function loadSavedToken() {
  const fromEnv = envFirst('SYNAPSOUL_TOKEN', 'LEARNLAB_TOKEN')
  if (fromEnv) return fromEnv
  if (!existsSync(AUTH_PATH)) return null
  try {
    const data = JSON.parse(readFileSync(AUTH_PATH, 'utf8'))
    return data.token || null
  } catch {
    return null
  }
}

export function saveToken(token, email) {
  mkdirSync(dirname(AUTH_PATH), { recursive: true })
  writeFileSync(
    AUTH_PATH,
    JSON.stringify({ token, email: email || null, saved_at: new Date().toISOString() }, null, 2) + '\n',
    'utf8'
  )
}

async function apiFetch(apiBase, path, { method = 'GET', token, body, timeoutMs = 15000 } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

export async function loginToApi(email, password, apiBase) {
  const base = apiBase || resolveSyncApiBase({ login: true })
  if (!base) {
    throw new Error(`Set SYNAPSOUL_API_URL=${PRODUCTION_API} or sign in at ${PRODUCTION_SITE}`)
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
  if (!base) throw new Error('SYNAPSOUL_API_URL is not set')
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

const CLI_EVENT_TYPES = new Set(['start', 'next', 'hint', 'decide', 'module_complete', 'sync'])

export function isCliLoggedIn() {
  return Boolean(loadSavedToken())
}

export async function postCliEvent({ type, skillId, moduleId, step, payload } = {}) {
  if (!CLI_EVENT_TYPES.has(type)) return { ok: false, skipped: 'type' }
  const token = loadSavedToken()
  const apiBase = getApiBase() || PRODUCTION_API
  if (!token) return { ok: false, loginRequired: true }
  try {
    await apiFetch(apiBase, '/api/progress/events', {
      method: 'POST',
      token,
      timeoutMs: 8000,
      body: {
        type,
        skillId: skillId || null,
        moduleId: moduleId || null,
        step: step || null,
        payload: payload && typeof payload === 'object' ? payload : {},
        at: new Date().toISOString(),
        source: 'cli',
      },
    })
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      loginRequired: e.status === 401,
      error: e.message,
    }
  }
}
