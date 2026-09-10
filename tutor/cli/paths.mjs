import { homedir } from 'os'
import { dirname, join } from 'path'
import { existsSync, readFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const CLI_ROOT = join(__dirname, '..')
export const PRODUCTION_API = 'https://learnerslab.onrender.com'
export const PRODUCTION_SITE = 'https://synapsoullearn.runs-on.dev'
export const CLI_NAME = 'synapsoul'

/** Prefer SYNAPSOUL_* then legacy LEARNLAB_* so old installs keep working. */
export function envFirst(...keys) {
  for (const key of keys) {
    const v = process.env[key]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''
}

export function learnlabHome() {
  const fromEnv = envFirst('SYNAPSOUL_HOME', 'LEARNLAB_HOME')
  if (fromEnv) return fromEnv
  const syn = join(homedir(), '.synapsoul')
  const legacy = join(homedir(), '.learnlab')
  if (existsSync(syn)) return syn
  if (existsSync(legacy)) return legacy
  return syn
}

export function isStandalone() {
  if (envFirst('SYNAPSOUL_STANDALONE', 'LEARNLAB_STANDALONE') === '1') return true
  const home = learnlabHome().replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  const root = CLI_ROOT.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  return root === home || root.startsWith(`${home}/`)
}

export function loadInstallConfig() {
  const p = join(learnlabHome(), 'config.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export function dataDir() {
  const fromEnv = envFirst('SYNAPSOUL_DATA_DIR', 'LEARNLAB_DATA_DIR')
  if (fromEnv) return fromEnv
  return join(CLI_ROOT, 'data')
}

export function progressFile() {
  if (isStandalone()) return join(learnlabHome(), 'session.json')
  return join(dataDir(), 'progress.json')
}

export function authFile() {
  if (isStandalone()) return join(learnlabHome(), 'auth.json')
  return join(dataDir(), 'sync', 'auth.json')
}

export function syncDirPath() {
  if (isStandalone()) return join(learnlabHome(), 'sync')
  return join(dataDir(), 'sync')
}

export function publicDir() {
  return join(dataDir(), 'public')
}

export function feedbackDir() {
  return join(dataDir(), 'feedback')
}

/** SynapSoul Local Learner store (~/.synapsoul/learner). */
export function learnerDir() {
  const fromEnv = envFirst('SYNAPSOUL_LEARNER_DIR')
  if (fromEnv) return fromEnv
  return join(learnlabHome(), 'learner')
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function defaultApiBase() {
  const env = envFirst('SYNAPSOUL_API_URL', 'LEARNLAB_API_URL', 'VITE_API_URL').replace(/\/$/, '')
  if (env) return env
  const cfg = loadInstallConfig()
  if (cfg?.apiUrl) return String(cfg.apiUrl).replace(/\/$/, '')
  if (isStandalone()) return PRODUCTION_API
  return ''
}

export function siteUrl() {
  const cfg = loadInstallConfig()
  return String(cfg?.siteUrl || PRODUCTION_SITE).replace(/\/$/, '')
}
