import { Router } from 'express'
import { pool } from '../db/pool.js'
import { auth } from '../middleware/auth.js'
import { AdaptiveEngine, hydrateFromProgress, maybeCoachNote } from '../lib/brain/index.js'

const router = Router()

async function loadMemory(uid) {
  const { rows } = await pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [uid])
  return rows[0]?.memory || {}
}

async function saveMemory(uid, memory) {
  await pool.query(
    `INSERT INTO student_memory (user_id, memory) VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET memory = $2::jsonb`,
    [uid, JSON.stringify(memory)]
  )
}

function engineFrom(memory, progress) {
  const engine = new AdaptiveEngine({ state: memory.brain })
  if (progress) hydrateFromProgress(engine, progress)
  return engine
}

router.get('/', auth, async (req, res) => {
  try {
    const memory = await loadMemory(req.user.id)
    const engine = engineFrom(memory)
    res.json({
      state: engine.state,
      snapshot: engine.snapshot(),
      updatedAt: engine.state.updatedAt,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/', auth, async (req, res) => {
  try {
    const incoming = req.body?.state
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'state object required' })
    }
    const memory = await loadMemory(req.user.id)
    memory.brain = incoming
    await saveMemory(req.user.id, memory)
    const engine = engineFrom(memory)
    res.json({ ok: true, snapshot: engine.snapshot() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/observe', auth, async (req, res) => {
  try {
    const event = req.body
    if (!event?.type) return res.status(400).json({ error: 'event.type required' })
    const memory = await loadMemory(req.user.id)
    const engine = engineFrom(memory)
    engine.observe(event)
    memory.brain = engine.state
    await saveMemory(req.user.id, memory)
    res.json({ ok: true, snapshot: engine.snapshot() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/coach', auth, async (req, res) => {
  try {
    const note = await maybeCoachNote(req.body || {})
    res.json(note)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
