import { pool } from '../db/pool.js'

export const CLI_EVENT_TYPES = ['start', 'next', 'hint', 'decide', 'module_complete', 'sync']

const TYPE_SET = new Set(CLI_EVENT_TYPES)
const BLOCKED_KEY = /password|passwd|token|secret|authorization|cookie|clipboard|screenshot|keylog|private.?key|api.?key|evidence|proof|file.?content/i
const MAX_STRING = 280
const MAX_KEYS = 16

export function isAllowedCliType(type) {
  return TYPE_SET.has(String(type || '').trim())
}

export function isTestAccount(email, name = '') {
  const e = String(email || '').trim().toLowerCase()
  const n = String(name || '').trim().toLowerCase()
  if (e.endsWith('@test.local')) return true
  if (/^audit[-.]/.test(e)) return true
  if (n.includes('live audit')) return true
  return false
}

/** IDE proof is cli_events only. A user_sessions row without events is not CLI. */
export function classifyLearnerActivity({
  cliEventCount = 0,
  lastCliAt = null,
  lastSeen = null,
  session = null,
} = {}) {
  const hasCli = Number(cliEventCount || 0) > 0 || Boolean(lastCliAt)
  const hasSession = Boolean(session?.skillId || session?.skill_id)
  return {
    has_cli: hasCli,
    activity: hasCli ? 'ide_cli' : (lastSeen || hasSession ? 'website' : 'none'),
    session_kind: !hasSession ? 'none' : (hasCli ? 'cli_sync' : 'website'),
  }
}

function clip(value) {
  if (value == null) return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const text = String(value)
  return text.length > MAX_STRING ? text.slice(0, MAX_STRING) : text
}

export function sanitizeCliPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    if (count >= MAX_KEYS) break
    if (!key || BLOCKED_KEY.test(key)) continue
    if (value == null) {
      out[key] = null
      count += 1
      continue
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = clip(value)
      count += 1
      continue
    }
  }
  if (!out.source) out.source = 'cli'
  return out
}

export function normalizeCliEvent(body = {}) {
  const type = String(body.type || '').trim()
  if (!isAllowedCliType(type)) return { error: 'Unsupported event type' }
  const skillId = body.skillId || body.skill_id || null
  const moduleId = body.moduleId || body.module_id || null
  const step = body.step || null
  const payload = sanitizeCliPayload(body.payload)
  if (body.source && !payload.source) payload.source = clip(body.source)
  if (body.at && !payload.at) payload.at = clip(body.at)
  return {
    type,
    skillId: skillId ? clip(skillId) : null,
    moduleId: moduleId ? clip(moduleId) : null,
    step: step ? clip(step) : null,
    payload,
  }
}

export async function insertCliEvent(userId, event) {
  const { rows } = await pool.query(
    `INSERT INTO cli_events (user_id, type, skill_id, module_id, step, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING id, type, skill_id, module_id, step, payload, created_at`,
    [
      userId,
      event.type,
      event.skillId,
      event.moduleId,
      event.step,
      JSON.stringify(event.payload || {}),
    ]
  )
  return rows[0]
}

export function mapCliEventRow(row) {
  if (!row) return null
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
  return {
    type: row.type,
    source: payload.source || 'cli',
    at: row.created_at,
    skill_id: row.skill_id || null,
    module_id: row.module_id || null,
    step: row.step || null,
    hints_used: payload.hintsUsed ?? payload.hints_used ?? null,
    payload,
    detail: cliEventDetail(row.type, payload, row.step),
  }
}

function cliEventDetail(type, payload, step) {
  if (type === 'hint' && payload.hintsUsed != null) return `hint ${payload.hintsUsed}`
  if (type === 'decide' && payload.choice) return `choice ${payload.choice}`
  if (type === 'next' && (payload.previousStep || step)) {
    return payload.previousStep && step ? `${payload.previousStep} → ${step}` : (step || payload.previousStep)
  }
  if (type === 'module_complete' && payload.score != null) return `score ${payload.score}`
  if (type === 'sync') return payload.ok === false ? 'sync failed' : 'synced'
  return step || type
}
