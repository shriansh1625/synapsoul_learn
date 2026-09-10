import nodemailer from 'nodemailer'
import { LOCKED_ADMIN_EMAIL } from './adminConstants.js'

const SMTP_TIMEOUT_MS = 10_000
const GMAIL_HOST = 'smtp.gmail.com'
export const GMAIL_NOT_CONFIGURED_MESSAGE =
  'GMAIL_APP_PASSWORD is missing on Render learnlab-api (learnerslab.onrender.com). Vercel env vars are not used. Use a 16-character App Password with no spaces.'

export function sanitizeGmailAppPassword(raw) {
  return String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
}

export function gmailUser() {
  const raw = String(process.env.GMAIL_USER || LOCKED_ADMIN_EMAIL)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
    .replace(/\s+/g, '')
  return raw || LOCKED_ADMIN_EMAIL
}

export function gmailAppPassword() {
  return sanitizeGmailAppPassword(process.env.GMAIL_APP_PASSWORD)
}

export function gmailConfigured() {
  return Boolean(gmailAppPassword())
}

function gmailNotConfiguredError() {
  const err = new Error(GMAIL_NOT_CONFIGURED_MESSAGE)
  err.code = 'GMAIL_NOT_CONFIGURED'
  err.status = 503
  return err
}

function smtpTransport({ port, secure }) {
  return nodemailer.createTransport({
    host: GMAIL_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: gmailUser(),
      pass: gmailAppPassword(),
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    tls: { minVersion: 'TLSv1.2' },
  })
}

function smtpResponseCode(err) {
  const fromField = Number(err?.responseCode)
  if (Number.isFinite(fromField) && fromField > 0) return fromField
  const text = `${err?.response || ''} ${err?.message || ''}`
  const match = text.match(/\b(535|534|454|421)\b/)
  return match ? Number(match[1]) : 0
}

export function isAuthError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  const response = String(err?.response || '')
  const smtpCode = smtpResponseCode(err)
  return (
    code === 'EAUTH' ||
    smtpCode === 535 ||
    smtpCode === 534 ||
    /invalid login|username and password|badcredentials|application-specific password/i.test(
      `${msg} ${response}`
    )
  )
}

export function isTimeoutError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return (
    /ETIMEDOUT|ETIMEOUT|ESOCKETTIMEDOUT/i.test(code) ||
    /timeout|timed out|greeting never received/i.test(msg)
  )
}

export function isConnectionError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return (
    /ECONNRESET|ECONNREFUSED|ECONNECTION|ENOTFOUND|EDNS|ESOCKET|ETLS|EPROTOCOL|EHOSTUNREACH|ENETUNREACH/i.test(
      code
    ) || /connect(ion)? (failed|refused)|socket closed|network is unreachable/i.test(msg)
  )
}

export function publicSmtpErrorMessage(err) {
  if (isAuthError(err)) {
    return 'Gmail rejected the login (SMTP 535). Set a 16-character App Password on Render learnlab-api — no spaces. Not Vercel.'
  }
  if (isTimeoutError(err)) {
    return 'Gmail SMTP timed out on smtp.gmail.com:587. Set GMAIL_APP_PASSWORD on Render learnlab-api, or outbound SMTP may be blocked.'
  }
  if (isConnectionError(err)) {
    return 'Could not reach smtp.gmail.com:587. Set GMAIL_USER and GMAIL_APP_PASSWORD on Render learnlab-api, not Vercel.'
  }
  return 'Could not send the admin code. Check GMAIL_USER and GMAIL_APP_PASSWORD on Render learnlab-api, not Vercel.'
}

function sendFailedError(cause) {
  const err = new Error(publicSmtpErrorMessage(cause))
  err.code = 'GMAIL_SEND_FAILED'
  err.status = 503
  return err
}

export async function sendAdminOtpEmail(code) {
  if (!gmailConfigured()) throw gmailNotConfiguredError()

  const mail = {
    from: `LearnLab <${LOCKED_ADMIN_EMAIL}>`,
    to: LOCKED_ADMIN_EMAIL,
    subject: 'LearnLab admin code',
    text: `${code}\n\nThis code expires in 10 minutes.`,
  }

  const attempts = [
    { port: 587, secure: false },
    { port: 465, secure: true },
  ]

  let lastErr
  for (const attempt of attempts) {
    try {
      const transporter = smtpTransport(attempt)
      await transporter.sendMail(mail)
      return
    } catch (e) {
      lastErr = e
      console.warn('Admin OTP email failed:', {
        port: attempt.port,
        code: e?.code || 'SMTP_ERROR',
        responseCode: smtpResponseCode(e) || undefined,
        command: e?.command,
      })
      if (isAuthError(e)) break
    }
  }

  throw sendFailedError(lastErr)
}
