import test from 'node:test'
import assert from 'node:assert/strict'
import { freshProgress } from './freshProgress.js'

test('new learners have no pretest answers, session, scores or completed work', () => {
  const progress = freshProgress()
  assert.equal(progress.profile.pretestCompleted, false)
  assert.equal(progress.session, null)
  assert.equal(progress.pretest, null)
  assert.deepEqual(progress.completedModules, {})
  assert.deepEqual(progress.scores, {})
  assert.deepEqual(progress.portfolio, [])
})
test('each learner receives independent mutable collections', () => {
  const first = freshProgress()
  first.profile.interests.push('security')
  first.completedModules.example = true
  const second = freshProgress()
  assert.deepEqual(second.profile.interests, [])
  assert.deepEqual(second.completedModules, {})
})
