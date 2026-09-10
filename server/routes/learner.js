import { Router } from 'express'
import { auth } from '../middleware/auth.js'
import { pool } from '../db/pool.js'
import { mirrorObserveFireAndForget } from '../lib/learning/ServerLearnerMirror.js'

const router = Router()

function sanitizeDigest(digest) {
  if (!digest || typeof digest !== 'object') return null
  const rules = Array.isArray(digest.teaching_rules)
    ? digest.teaching_rules.map(r => String(r).slice(0, 500)).slice(0, 5)
    : []
  const signals = digest.signals && typeof digest.signals === 'object' ? digest.signals : {}
  return {
    version: digest.version || 1,
    synced_at: digest.synced_at || new Date().toISOString(),
    teaching_rules: rules,
    signals: {
      hint_dependency: signals.hint_dependency || null,
      pace: signals.pace || null,
      modules_completed: signals.modules_completed ?? null,
      chunk_count: signals.chunk_count ?? null,
    },
    last_consolidation: digest.last_consolidation || null,
    consolidation_source: digest.consolidation_source || null,
  }
}

router.post('/sync', auth, async (req, res) => {
  try {
    const digest = sanitizeDigest(req.body?.digest)
    if (!digest) return res.status(400).json({ error: 'digest object required' })

    const updated = await pool.query(
      'UPDATE student_memory SET learner_digest = $2::jsonb WHERE user_id = $1 RETURNING user_id',
      [req.user.id, JSON.stringify(digest)]
    )
    if (!updated.rows[0]) {
      await pool.query(
        'INSERT INTO student_memory (user_id, memory, learner_digest) VALUES ($1, $2::jsonb, $3::jsonb)',
        [req.user.id, '{}', JSON.stringify(digest)]
      )
    }

    mirrorObserveFireAndForget(req.user.id, { type: 'sync', command: 'learner sync' })
    res.json({ ok: true, digest })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/observe', auth, async (req, res) => {
  try {
    const body = req.body || {}
    const event = {
      type: body.type || 'website',
      command: body.command || null,
      source: body.source || 'website',
      skillId: body.skillId || null,
      moduleId: body.moduleId || null,
      step: body.step || null,
      text: body.text || null,
    }
    mirrorObserveFireAndForget(req.user.id, event, {
      progress: body.progress || null,
      brainSnapshot: body.brainSnapshot || null,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/digest', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT learner_digest FROM student_memory WHERE user_id = $1',
      [req.user.id]
    )
    res.json({ digest: rows[0]?.learner_digest || null })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
