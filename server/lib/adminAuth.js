import { timingSafeEqual } from 'crypto'
import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

export function notFound(res) {
  return res.status(404).json({ error: 'Not found' })
}

export function adminEmail() {
  return (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
}

export function emailIsAdmin(email) {
  const configured = adminEmail()
  return Boolean(configured && email && String(email).trim().toLowerCase() === configured)
}

export function adminSecretMatches(provided) {
  const expected = process.env.ADMIN_SECRET || ''
  if (!expected || provided == null) return false
  const a = Buffer.from(String(provided))
  const b = Buffer.from(String(expected))
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function isAdminRecord(user) {
  if (!user) return false
  return Boolean(user.is_admin) || emailIsAdmin(user.email)
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
  if (user.is_admin) return user
  if (!emailIsAdmin(user.email)) return user
  await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [user.id])
  user.is_admin = true
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
