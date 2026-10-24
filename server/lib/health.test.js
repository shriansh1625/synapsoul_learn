import test from 'node:test'
import assert from 'node:assert/strict'
import { healthResponse } from './health.js'

test('healthy database produces a ready response', () => {
  const response = healthResponse({ db: 'ok', llmTables: 'ok', cliEventsTable: 'ok' })
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.dbError, undefined)
})
for (const db of ['error', 'not_configured']) {
  test(`${db} cannot be advertised as ready or disclose diagnostics`, () => {
    const response = healthResponse({ db, dbError: 'sensitive diagnostic' })
    assert.equal(response.statusCode, 503)
    assert.equal(response.body.status, 'unavailable')
    assert.equal(response.body.dbError, 'Database temporarily unavailable')
  })
}
