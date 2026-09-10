import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeGmailAppPassword,
  isAuthError,
  isTimeoutError,
  isConnectionError,
  publicSmtpErrorMessage,
} from './mailer.js'

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
  it('maps SMTP 535 to invalid credentials without leaking secrets', () => {
    const msg = publicSmtpErrorMessage({
      code: 'EAUTH',
      responseCode: 535,
      message: 'Invalid login: 535-5.7.8 Username and Password not accepted',
    })
    assert.match(msg, /535/)
    assert.match(msg, /App Password/)
    assert.doesNotMatch(msg, /accepted|Username and Password not accepted/i)
  })

  it('maps timeouts separately from missing env', () => {
    const msg = publicSmtpErrorMessage({
      code: 'ETIMEDOUT',
      message: 'Connection timeout',
    })
    assert.match(msg, /timed out/i)
    assert.match(msg, /587/)
  })

  it('maps connection refused separately from 535', () => {
    const msg = publicSmtpErrorMessage({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED',
    })
    assert.match(msg, /Could not reach smtp.gmail.com/i)
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
