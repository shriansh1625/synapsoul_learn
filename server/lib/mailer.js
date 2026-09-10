import nodemailer from 'nodemailer'
import { LOCKED_ADMIN_EMAIL } from './adminConstants.js'

const SMTP_TIMEOUT_MS = 10_000
const GMAIL_NOT_CONFIGURED_MESSAGE =
  'Gmail App Password is not configured. Set GMAIL_APP_PASSWORD on the Render API service (Google Account → Security → 2-Step Verification → App passwords).'

export function gmailUser() {
  return (process.env.GMAIL_USER || LOCKED_ADMIN_EMAIL).trim() || LOCKED_ADMIN_EMAIL
}

export function gmailAppPassword() {
  return (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
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
    host: 'smtp.gmail.com',
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

function isAuthError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return code === 'EAUTH' || /invalid login|username and password|\b535\b/i.test(msg)
}

function isTimeoutError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return (
    /ETIMEDOUT|ESOCKET|ECONNECTION|ETLS|EPROTOCOL/i.test(code) ||
    /timeout|timed out|greeting never received/i.test(msg)
  )
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
      if (isAuthError(e)) break
    }
  }

  console.warn('Admin OTP email failed:', lastErr?.code || 'SMTP_ERROR')

  const err = new Error(
    isAuthError(lastErr)
      ? 'Gmail rejected the login. Set a valid GMAIL_APP_PASSWORD on the Render API service.'
      : isTimeoutError(lastErr)
        ? 'Gmail SMTP timed out. Set GMAIL_APP_PASSWORD on Render, or smtp.gmail.com ports 587/465 may be blocked.'
        : 'Could not send the admin code to Gmail. Check GMAIL_USER and GMAIL_APP_PASSWORD on Render.'
  )
  err.code = 'GMAIL_SEND_FAILED'
  err.status = 503
  throw err
}
