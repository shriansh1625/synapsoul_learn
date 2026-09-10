import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeGmailAppPassword,
  isAuthError,
  isTimeoutError,
  isConnectionError,
  publicSmtpErrorMessage,
  resendConfigured,
  mailerConfigured,
  resendFrom,
  RESEND_NOT_CONFIGURED_MESSAGE,
  sendAdminOtpEmail,
} from './mailer.js'

const saved = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
  RENDER: process.env.RENDER,
}

afterEach(() => {
  process.env.RESEND_API_KEY = saved.RESEND_API_KEY
  process.env.RESEND_FROM = saved.RESEND_FROM
  process.env.GMAIL_APP_PASSWORD = saved.GMAIL_APP_PASSWORD
  process.env.RENDER = saved.RENDER
  if (saved.RESEND_API_KEY == null) delete process.env.RESEND_API_KEY
  if (saved.RESEND_FROM == null) delete process.env.RESEND_FROM
  if (saved.GMAIL_APP_PASSWORD == null) delete process.env.GMAIL_APP_PASSWORD
  if (saved.RENDER == null) delete process.env.RENDER
})

describe('sanitizeGmailAppPassword', () => {
  it('strips spaces and newlines from Google-style App Passwords', () => {
    assert.equal(sanitizeGmailAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop')
    assert.equal(sanitizeGmailAppPassword('abcd\nefgh\r\nijkl mnop\n'), 'abcdefghijklmnop')
  })

  it('strips wrapping quotes and zero-width characters', () => {
    assert.equal(sanitizeGmailAppPassword('"abcdefghijklmnop"'), 'abcdefghijklmnop')
    assert.equal(sanitizeGmailAppPassword("  'ab cd ef gh ij kl mn op'  "), 'abcdefghijklmnop')
    assert.equal(sanitizeGmailAppPassword('\uFEFFabcd efgh ijkl mnop'), 'abcdefghijklmnop')
  })
})

describe('publicSmtpErrorMessage', () => {
  it('maps SMTP 535 to Resend setup instead of SMTP as the main path', () => {
    const msg = publicSmtpErrorMessage({
      code: 'EAUTH',
      responseCode: 535,
      message: 'Invalid login: 535-5.7.8 Username and Password not accepted',
    })
    assert.match(msg, /resend\.com/)
    assert.match(msg, /RESEND_API_KEY/)
    assert.doesNotMatch(msg, /accepted|Username and Password not accepted/i)
  })

  it('maps timeouts to Render SMTP block plus Resend steps', () => {
    const msg = publicSmtpErrorMessage({
      code: 'ETIMEDOUT',
      message: 'Connection timeout',
    })
    assert.match(msg, /timed out/i)
    assert.match(msg, /587/)
    assert.match(msg, /465/)
    assert.match(msg, /RESEND_API_KEY/)
  })

  it('maps connection refused to Resend steps', () => {
    const msg = publicSmtpErrorMessage({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED',
    })
    assert.match(msg, /Could not reach smtp.gmail.com/i)
    assert.match(msg, /RESEND_API_KEY/)
    assert.doesNotMatch(msg, /535/)
  })
})

describe('smtp error classifiers', () => {
  it('treats 535 in the message as auth even without EAUTH', () => {
    assert.equal(isAuthError({ message: '535-5.7.8 Username and Password not accepted' }), true)
    assert.equal(isTimeoutError({ code: 'ETIMEDOUT' }), true)
    assert.equal(isConnectionError({ code: 'ECONNREFUSED' }), true)
    assert.equal(isAuthError({ code: 'ETIMEDOUT' }), false)
  })
})

describe('resend mailer', () => {
  it('defaults from to Resend onboarding until a domain is verified', () => {
    delete process.env.RESEND_FROM
    assert.equal(resendFrom(), 'LearnLab <onboarding@resend.dev>')
  })

  it('treats Resend as configured when RESEND_API_KEY is set', () => {
    delete process.env.RESEND_API_KEY
    delete process.env.GMAIL_APP_PASSWORD
    delete process.env.RENDER
    assert.equal(resendConfigured(), false)
    assert.equal(mailerConfigured(), false)
    process.env.RESEND_API_KEY = 're_test_key'
    assert.equal(resendConfigured(), true)
    assert.equal(mailerConfigured(), true)
  })

  it('does not use SMTP on Render when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY
    process.env.GMAIL_APP_PASSWORD = 'abcdefghijklmnop'
    process.env.RENDER = 'true'
    await assert.rejects(
      () => sendAdminOtpEmail('123456'),
      err => {
        assert.equal(err.status, 503)
        assert.equal(err.code, 'MAILER_NOT_CONFIGURED')
        assert.equal(err.message, RESEND_NOT_CONFIGURED_MESSAGE)
        return true
      }
    )
  })

  it('returns 503 Resend steps when no mailer is configured', async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.GMAIL_APP_PASSWORD
    await assert.rejects(
      () => sendAdminOtpEmail('123456'),
      err => {
        assert.equal(err.status, 503)
        assert.equal(err.code, 'MAILER_NOT_CONFIGURED')
        assert.equal(err.message, RESEND_NOT_CONFIGURED_MESSAGE)
        assert.match(err.message, /resend\.com/)
        assert.match(err.message, /RESEND_API_KEY/)
        assert.doesNotMatch(err.message, /SMTP as the main/i)
        return true
      }
    )
  })

  it('POSTs to Resend over HTTPS when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    delete process.env.GMAIL_APP_PASSWORD
    const originalFetch = globalThis.fetch
    const calls = []
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, opts })
      return { ok: true, json: async () => ({ id: 'email_1' }) }
    }
    try {
      await sendAdminOtpEmail('123456')
    } finally {
      globalThis.fetch = originalFetch
    }
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.resend.com/emails')
    assert.equal(calls[0].opts.method, 'POST')
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer re_test_key')
    const body = JSON.parse(calls[0].opts.body)
    assert.equal(body.to[0], 'omshriansh16@gmail.com')
    assert.equal(body.from, 'LearnLab <onboarding@resend.dev>')
    assert.equal(body.subject, 'LearnLab admin code')
    assert.match(body.text, /123456/)
    assert.match(body.text, /10 minutes/)
  })
})
