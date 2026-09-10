import nodemailer from 'nodemailer'
import { LOCKED_ADMIN_EMAIL } from './adminConstants.js'

export function gmailUser() {
  return (process.env.GMAIL_USER || LOCKED_ADMIN_EMAIL).trim() || LOCKED_ADMIN_EMAIL
}

export function gmailAppPassword() {
  return (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
}

export function gmailConfigured() {
  return Boolean(gmailAppPassword())
}

export async function sendAdminOtpEmail(code) {
  if (!gmailConfigured()) {
    const err = new Error('Gmail App Password is not configured. Set GMAIL_APP_PASSWORD on the API host (Google Account → Security → 2-Step Verification → App passwords).')
    err.code = 'GMAIL_NOT_CONFIGURED'
    err.status = 503
    throw err
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser(),
      pass: gmailAppPassword(),
    },
  })

  await transporter.sendMail({
    from: `LearnLab <${LOCKED_ADMIN_EMAIL}>`,
    to: LOCKED_ADMIN_EMAIL,
    subject: 'LearnLab admin code',
    text: `${code}\n\nThis code expires in 10 minutes.`,
  })
}
