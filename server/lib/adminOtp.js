import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { pool } from '../db/pool.js'
import { LOCKED_ADMIN_EMAIL } from './adminConstants.js'
import { gmailConfigured, sendAdminOtpEmail } from './mailer.js'

function adminEmail() {
  return LOCKED_ADMIN_EMAIL
}

const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RATE_MS = 60 * 1000
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

function otpPepper() {
  return process.env.JWT_SECRET || 'dev-secret-change-in-production'
}

export function hashOtp(code) {
  return createHash('sha256')
    .update(`learnlab-admin-otp:${adminEmail()}:${String(code)}:${otpPepper()}`)
    .digest('hex')
}

export function hashAdminSession(token) {
  return createHash('sha256')
    .update(`learnlab-admin-session:${String(token)}:${otpPepper()}`)
    .digest('hex')
}

function hashesEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function normalizeOtpCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

async function hashAlreadyUsed(codeHash) {
  const { rows } = await pool.query(
    'SELECT 1 FROM admin_otps WHERE code_hash = $1 LIMIT 1',
    [codeHash]
  )
  return Boolean(rows[0])
}

export async function generateUniqueOtp() {
  for (let i = 0; i < 48; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const codeHash = hashOtp(code)
    if (!(await hashAlreadyUsed(codeHash))) return { code, codeHash }
  }
  const err = new Error('Could not generate a unique admin code. Try again.')
  err.status = 503
  err.code = 'OTP_GENERATE_FAILED'
  throw err
}

export async function otpRetryAfterSeconds(email) {
  const { rows } = await pool.query(
    'SELECT created_at FROM admin_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [email]
  )
  if (!rows[0]?.created_at) return 0
  const wait = OTP_RATE_MS - (Date.now() - new Date(rows[0].created_at).getTime())
  return wait > 0 ? Math.ceil(wait / 1000) : 0
}

export async function requestAdminOtp() {
  const email = adminEmail()
  const retryAfter = await otpRetryAfterSeconds(email)
  if (retryAfter > 0) {
    const err = new Error('Wait 60 seconds before requesting another code.')
    err.status = 429
    err.code = 'OTP_RATE_LIMITED'
    err.retryAfter = retryAfter
    throw err
  }

  if (!gmailConfigured()) {
    const err = new Error('Gmail App Password is not configured. Set GMAIL_APP_PASSWORD on the API host (Google Account → Security → 2-Step Verification → App passwords).')
    err.status = 503
    err.code = 'GMAIL_NOT_CONFIGURED'
    throw err
  }

  const { code, codeHash } = await generateUniqueOtp()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  await pool.query(
    'UPDATE admin_otps SET used_at = NOW() WHERE email = $1 AND used_at IS NULL',
    [email]
  )

  try {
    await pool.query(
      `INSERT INTO admin_otps (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [email, codeHash, expiresAt]
    )
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('Could not generate a unique admin code. Try again.')
      err.status = 503
      err.code = 'OTP_GENERATE_FAILED'
      throw err
    }
    throw e
  }

  try {
    await sendAdminOtpEmail(code)
  } catch (e) {
    if (e.code === 'GMAIL_NOT_CONFIGURED') throw e
    const err = new Error('Could not send the admin code to Gmail. Check GMAIL_USER and GMAIL_APP_PASSWORD.')
    err.status = 503
    err.code = 'GMAIL_SEND_FAILED'
    throw err
  }

  return { ok: true, expiresAt, retryAfter: 60 }
}

export async function verifyAdminOtp(userId, rawCode) {
  const code = normalizeOtpCode(rawCode)
  if (!/^\d{6}$/.test(code)) {
    const err = new Error('Enter the 6-digit code from Gmail.')
    err.status = 400
    err.code = 'OTP_INVALID'
    throw err
  }

  const email = adminEmail()
  const codeHash = hashOtp(code)
  const { rows } = await pool.query(
    `SELECT id, code_hash, expires_at, used_at
     FROM admin_otps
     WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 8`,
    [email]
  )

  const match = rows.find(row => hashesEqual(row.code_hash, codeHash))
  if (!match) {
    const err = new Error('Invalid or expired code.')
    err.status = 401
    err.code = 'OTP_INVALID'
    throw err
  }

  await pool.query('UPDATE admin_otps SET used_at = NOW() WHERE id = $1', [match.id])

  const token = randomBytes(32).toString('hex')
  const tokenHash = hashAdminSession(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await pool.query(
    `INSERT INTO admin_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  )

  return { token, expiresAt }
}

export async function loadValidAdminSession(userId, rawToken) {
  if (!rawToken || !userId) return null
  const tokenHash = hashAdminSession(rawToken)
  const { rows } = await pool.query(
    `SELECT id, user_id, expires_at
     FROM admin_sessions
     WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash, userId]
  )
  return rows[0] || null
}

export async function revokeAdminSession(userId, rawToken) {
  if (!rawToken || !userId) return
  const tokenHash = hashAdminSession(rawToken)
  await pool.query(
    'DELETE FROM admin_sessions WHERE user_id = $1 AND token_hash = $2',
    [userId, tokenHash]
  )
}

export function adminOtpError(res, err) {
  const status = err.status || 500
  const body = {
    error: err.message || 'Could not complete admin verification.',
    code: err.code || 'OTP_ERROR',
  }
  if (err.retryAfter) body.retryAfter = err.retryAfter
  return res.status(status).json(body)
}
