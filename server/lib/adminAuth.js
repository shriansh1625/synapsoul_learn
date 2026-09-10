import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'
import { LOCKED_ADMIN_EMAIL } from './adminConstants.js'
import { loadValidAdminSession } from './adminOtp.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

export { LOCKED_ADMIN_EMAIL }

export function notFound(res) {
  return res.status(404).json({ error: 'Not found' })
}

export function adminEmail() {
  return LOCKED_ADMIN_EMAIL
}

export function emailIsAdmin(email) {
  return Boolean(email && String(email).trim().toLowerCase() === adminEmail())
}

export function isAdminRecord(user) {
  return emailIsAdmin(user?.email)
}

export async function loadAdminUser(id) {
  const { rows } = await pool.query(
    'SELECT id, email, name, is_admin FROM users WHERE id = $1',
    [id]
  )
  return rows[0] || null
}

export async function promoteIfAdminEmail(user) {
  if (!user) return user
  if (emailIsAdmin(user.email)) {
    if (!user.is_admin) {
      await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id])
      user.is_admin = true
    }
    return user
  }
  if (user.is_admin) {
    await pool.query('UPDATE users SET is_admin = false WHERE id = $1', [user.id])
    user.is_admin = false
  }
  return user
}

export function requireAdminJwt(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return notFound(res)
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch {
    return notFound(res)
  }
}

export async function requireAdmin(req, res, next) {
  try {
    const row = await loadAdminUser(req.user.id)
    if (!row) return notFound(res)
    const promoted = await promoteIfAdminEmail(row)
    if (!isAdminRecord(promoted)) return notFound(res)
    req.admin = promoted
    next()
  } catch {
    return notFound(res)
  }
}

export async function requireAdminOtp(req, res, next) {
  try {
    const raw = req.headers['x-admin-session']
    const session = await loadValidAdminSession(req.user?.id, raw)
    if (!session) {
      return res.status(401).json({
        error: 'Admin verification required',
        code: 'OTP_REQUIRED',
      })
    }
    req.adminSession = session
    next()
  } catch {
    return res.status(401).json({
      error: 'Admin verification required',
      code: 'OTP_REQUIRED',
    })
  }
}

export async function touchLastSeen(userId) {
  if (!userId) return
  try {
    await pool.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId])
  } catch {
    /* column may not exist during first boot */
  }
}

export function readinessScore(modulesCompleted, avgScore, portfolioCount) {
  const completion = Math.min((modulesCompleted || 0) * 8, 40)
  const scorePart = Math.round((Number(avgScore) || 0) * 10)
  const port = Math.min((portfolioCount || 0) * 4, 20)
  return Math.min(100, completion + scorePart + port)
}
