import { pool } from '../db/pool.js'

const memory = new Map()
const TTL_MS = 5 * 60 * 1000
const NONCE_RE = /^cli_[a-zA-Z0-9_-]{16,128}$/

export function isCliNonce(value) {
  return NONCE_RE.test(String(value || ''))
}

export function parseCliNonce(req) {
  const candidates = [req.query?.nonce, req.query?.state]
  for (const raw of candidates) {
    const value = String(raw || '')
    if (isCliNonce(value)) return value
  }
  return null
}

function fromMemory(nonce) {
  const row = memory.get(nonce)
  if (!row) return null
  if (row.expiresAt <= Date.now()) {
    memory.delete(nonce)
    return null
  }
  return row
}

async function sweepDb() {
  try {
    await pool.query('DELETE FROM cli_auth_pending WHERE expires_at <= NOW()')
  } catch {
    /* table may not exist yet */
  }
}

export async function putCliToken(nonce, { token, user } = {}) {
  if (!isCliNonce(nonce) || !token) return false
  const expiresAt = Date.now() + TTL_MS
  const payload = {
    token,
    email: user?.email || null,
    name: user?.name || null,
    username: user?.username || null,
    expiresAt,
  }
  memory.set(nonce, payload)
  try {
    await pool.query(
      `INSERT INTO cli_auth_pending (nonce, token, email, name, username, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (nonce) DO UPDATE SET
         token = EXCLUDED.token,
         email = EXCLUDED.email,
         name = EXCLUDED.name,
         username = EXCLUDED.username,
         expires_at = EXCLUDED.expires_at`,
      [nonce, token, payload.email, payload.name, payload.username, new Date(expiresAt)]
    )
  } catch {
    /* memory fallback if DB is unavailable */
  }
  return true
}

export async function takeCliToken(nonce) {
  if (!isCliNonce(nonce)) return { pending: true }
  await sweepDb()

  const mem = fromMemory(nonce)
  if (mem?.token) {
    memory.delete(nonce)
    try {
      await pool.query('DELETE FROM cli_auth_pending WHERE nonce = $1', [nonce])
    } catch {
      /* ignore */
    }
    return {
      token: mem.token,
      user: { email: mem.email, name: mem.name, username: mem.username },
    }
  }

  try {
    const { rows } = await pool.query(
      `DELETE FROM cli_auth_pending
       WHERE nonce = $1 AND expires_at > NOW() AND token IS NOT NULL
       RETURNING token, email, name, username`,
      [nonce]
    )
    if (rows[0]?.token) {
      return {
        token: rows[0].token,
        user: { email: rows[0].email, name: rows[0].name, username: rows[0].username },
      }
    }
  } catch {
    /* pending */
  }
  return { pending: true }
}
