import nodemailer from 'nodemailer'
import { LOCKED_ADMIN_EMAIL } from './adminConstants.js'

const SMTP_TIMEOUT_MS = 10_000
const RESEND_TIMEOUT_MS = 15_000
const GMAIL_HOST = 'smtp.gmail.com'
const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_RESEND_FROM = 'SynapSoul Learn Hub <onboarding@resend.dev>'

export const RESEND_NOT_CONFIGURED_MESSAGE =
  'RESEND_API_KEY is missing on the Render API service. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'

export const GMAIL_NOT_CONFIGURED_MESSAGE =
  'GMAIL_APP_PASSWORD is missing on the Render API service (learnerslab.onrender.com). Vercel env vars are not used. Use a 16-character App Password with no spaces.'

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

export function resendApiKey() {
  return sanitizeGmailAppPassword(process.env.RESEND_API_KEY)
}

export function resendConfigured() {
  return Boolean(resendApiKey())
}

export function resendFrom() {
  const raw = String(process.env.RESEND_FROM || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^['"`]+|['"`]+$/g, '')
  return raw || DEFAULT_RESEND_FROM
}

export function smtpFallbackAllowed() {
  return gmailConfigured() && process.env.RENDER !== 'true'
}

export function mailerConfigured() {
  return resendConfigured() || smtpFallbackAllowed()
}

function resendNotConfiguredError() {
  const err = new Error(RESEND_NOT_CONFIGURED_MESSAGE)
  err.code = 'MAILER_NOT_CONFIGURED'
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
    return 'Gmail rejected the SMTP login. Render blocks outbound SMTP on ports 587 and 465. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'
  }
  if (isTimeoutError(err)) {
    return 'Gmail SMTP timed out. Render blocks outbound SMTP on ports 587 and 465. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'
  }
  if (isConnectionError(err)) {
    return 'Could not reach smtp.gmail.com. Render blocks outbound SMTP on ports 587 and 465. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'
  }
  return 'Could not send the admin code over SMTP. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'
}

function sendFailedError(cause) {
  const err = new Error(publicSmtpErrorMessage(cause))
  err.code = 'GMAIL_SEND_FAILED'
  err.status = 503
  return err
}

function otpMailBody(code) {
  return `${code}\n\nThis code expires in 10 minutes.`
}

async function sendViaResend(code) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS)
  let res
  try {
    res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom(),
        to: [LOCKED_ADMIN_EMAIL],
        subject: 'SynapSoul Learn Hub admin code',
        text: otpMailBody(code),
      }),
      signal: controller.signal,
    })
  } catch (e) {
    const err = new Error(
      'Could not reach Resend over HTTPS. Check RESEND_API_KEY on the Render API service, then redeploy.'
    )
    err.code = 'RESEND_SEND_FAILED'
    err.status = 503
    err.cause = e
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (res.ok) return

  let detail = ''
  try {
    const payload = await res.json()
    detail = String(payload?.message || payload?.error || '').trim()
  } catch {
    detail = ''
  }

  const err = new Error(
    detail
      ? `Resend could not send the admin code (${res.status}). ${detail} Check RESEND_API_KEY on the Render API service.`
      : `Resend could not send the admin code (${res.status}). Check RESEND_API_KEY on the Render API service.`
  )
  err.code = 'RESEND_SEND_FAILED'
  err.status = 503
  throw err
}

async function sendViaSmtp(code) {
  const mail = {
    from: `SynapSoul Learn Hub <${LOCKED_ADMIN_EMAIL}>`,
    to: LOCKED_ADMIN_EMAIL,
    subject: 'SynapSoul Learn Hub admin code',
    text: otpMailBody(code),
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
      console.warn('Admin OTP SMTP fallback failed:', {
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

export async function sendAdminOtpEmail(code) {
  if (resendConfigured()) {
    await sendViaResend(code)
    return
  }
  if (smtpFallbackAllowed()) {
    await sendViaSmtp(code)
    return
  }
  throw resendNotConfiguredError()
}
