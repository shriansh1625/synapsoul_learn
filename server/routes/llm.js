import { Router } from 'express'
import { pool } from '../db/pool.js'
import { optionalAuth } from '../middleware/optionalAuth.js'
import { auth } from '../middleware/auth.js'
import { AdaptiveEngine, hydrateFromProgress } from '../lib/brain/index.js'
import { getLearnLabLLM } from '../lib/llm/LearnLabLLM.js'

const router = Router()
const llm = getLearnLabLLM()

async function loadBrainSnapshot(userId) {
  if (!userId || !pool) return null
  try {
    const { rows } = await pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [userId])
    const memory = rows[0]?.memory || {}
    if (!memory.brain) return null
    const engine = new AdaptiveEngine({ state: memory.brain })
    return engine.snapshot()
  } catch {
    return null
  }
}

async function loadProgressContext(userId, body = {}) {
  if (!userId || !pool) return { profile: null, decision: null }
  try {
    const { rows: users } = await pool.query(
      'SELECT name, degree, bio, track FROM users WHERE id = $1',
      [userId]
    )
    const profile = users[0] || null

    const { skillId, moduleId } = body
    let decision = null
    if (skillId && moduleId) {
      const { rows } = await pool.query(
        'SELECT choice, reasoning FROM decisions WHERE user_id = $1 AND skill_id = $2 AND module_id = $3',
        [userId, skillId, moduleId]
      )
      decision = rows[0] || null
    }
    return { profile, decision }
  } catch {
    return { profile: null, decision: null }
  }
}

function mergeContext(body, extras = {}) {
  return {
    skillId: body.skillId,
    moduleId: body.moduleId,
    step: body.step,
    track: body.track,
    event: body.event,
    hintText: body.hintText,
    hintsUsed: body.hintsUsed,
    why: body.why,
    struggle: body.struggle,
    moduleJson: body.moduleJson,
    stepContent: body.stepContent,
    decision: body.decision,
    profile: body.profile,
    brainSnapshot: body.brainSnapshot,
    ...extras,
  }
}

router.post('/coach', auth, async (req, res) => {
  try {
    const brainSnapshot = await loadBrainSnapshot(req.user.id)
    const { profile } = await loadProgressContext(req.user.id, req.body)
    const result = await llm.coach(mergeContext(req.body, { brainSnapshot, profile, userId: req.user.id }))
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/hint', optionalAuth, async (req, res) => {
  try {
    const extras = {}
    if (req.user?.id) {
      extras.brainSnapshot = await loadBrainSnapshot(req.user.id)
      const { profile } = await loadProgressContext(req.user.id, req.body)
      extras.profile = profile
    }
    const result = await llm.hint(mergeContext(req.body, { ...extras, userId: req.user?.id }))
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/reflect', optionalAuth, async (req, res) => {
  try {
    const extras = {}
    if (req.user?.id) {
      extras.brainSnapshot = await loadBrainSnapshot(req.user.id)
      const { profile, decision } = await loadProgressContext(req.user.id, req.body)
      extras.profile = profile
      if (!req.body.decision && decision) extras.decision = decision
    }
    const result = await llm.reflect(mergeContext(req.body, { ...extras, userId: req.user?.id }))
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/status', (_, res) => {
  res.json({ enabled: llm.enabled(), instructor: 'SynapSoul Instructor LLM' })
})

export default router
