import { Router } from 'express'
import { pool } from '../db/pool.js'
import { auth } from '../middleware/auth.js'
import { AdaptiveEngine } from '../lib/brain/index.js'

const router = Router()

router.get('/', auth, async (req, res) => {
  const uid = req.user.id
  const [user, session, completed, decisions, scores, portfolio, memory] = await Promise.all([
    pool.query(
      `SELECT id, email, name, degree, bio, username, college_name, track, profile_confirmed,
              github_id, github_username, github_avatar, linkedin_url, headline, location,
              website, avatar_url, profile_public
       FROM users WHERE id = $1`,
      [uid]
    ),
    pool.query('SELECT skill_id, module_id, step, track, hints_used, started_at FROM user_sessions WHERE user_id = $1', [uid]),
    pool.query('SELECT skill_id, module_id, score, track, completed_at FROM completed_modules WHERE user_id = $1', [uid]),
    pool.query('SELECT skill_id, module_id, choice, reasoning FROM decisions WHERE user_id = $1', [uid]),
    pool.query('SELECT skill_id, module_id, overall, dimensions, narrative FROM scores WHERE user_id = $1', [uid]),
    pool.query('SELECT artifact, student_action, technical_detail, proof, ability, confidence, skill_id, module_id FROM portfolio WHERE user_id = $1 ORDER BY recorded_at DESC', [uid]),
    pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [uid]),
  ])

  const completedModules = {}
  completed.rows.forEach(r => { completedModules[`${r.skill_id}:${r.module_id}`] = r })
  const decisionsMap = {}
  decisions.rows.forEach(r => { decisionsMap[`${r.skill_id}:${r.module_id}`] = r.choice })
  const scoresMap = {}
  scores.rows.forEach(r => {
    scoresMap[`${r.skill_id}:${r.module_id}`] = {
      overall: r.overall,
      ...r.dimensions,
      narrative: r.narrative,
    }
  })

  const sess = session.rows[0]
  res.json({
    version: 2,
    profile: user.rows[0],
    session: sess ? {
      skillId: sess.skill_id,
      moduleId: sess.module_id,
      step: sess.step,
      track: sess.track,
      hintsUsed: sess.hints_used,
      startedAt: sess.started_at,
    } : null,
    completedModules,
    decisions: decisionsMap,
    scores: scoresMap,
    portfolio: portfolio.rows,
    studentMemory: memory.rows[0]?.memory || {},
  })
})

router.put('/session', auth, async (req, res) => {
  const { skillId, moduleId, step, track, hintsUsed } = req.body
  await pool.query(
    `INSERT INTO user_sessions (user_id, skill_id, module_id, step, track, hints_used)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET skill_id=$2, module_id=$3, step=$4, track=$5, hints_used=$6, started_at=NOW()`,
    [req.user.id, skillId, moduleId, step, track || 'node', hintsUsed || 0]
  )
  res.json({ ok: true })
})

router.post('/module-complete', auth, async (req, res) => {
  const uid = req.user.id
  const { skillId, moduleId, score, track, decision, scoreData, portfolioItem } = req.body
  if (!skillId || !moduleId) return res.status(400).json({ error: 'skillId and moduleId required' })

  await pool.query(
    `INSERT INTO completed_modules (user_id, skill_id, module_id, score, track)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, skill_id, module_id) DO UPDATE SET score=$4, track=$5, completed_at=NOW()`,
    [uid, skillId, moduleId, score ?? null, track || 'node']
  )

  if (decision) {
    await pool.query(
      `INSERT INTO decisions (user_id, skill_id, module_id, choice, reasoning)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, skill_id, module_id) DO UPDATE SET choice=$4, reasoning=$5`,
      [uid, skillId, moduleId, decision.choice, decision.reasoning || '']
    )
  }

  if (scoreData) {
    const { overall, dimensions, narrative } = scoreData
    await pool.query(
      `INSERT INTO scores (user_id, skill_id, module_id, overall, dimensions, narrative)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, skill_id, module_id) DO UPDATE SET overall=$4, dimensions=$5, narrative=$6`,
      [uid, skillId, moduleId, overall ?? null, JSON.stringify(dimensions || {}), narrative || '']
    )
  }

  if (portfolioItem) {
    const { artifact, student_action, technical_detail, proof, ability, confidence } = portfolioItem
    await pool.query(
      `INSERT INTO portfolio (user_id, skill_id, module_id, artifact, student_action, technical_detail, proof, ability, confidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [uid, skillId, moduleId, artifact, student_action, technical_detail, proof, ability, confidence]
    )
  }

  try {
    const mem = await pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [uid])
    const memory = mem.rows[0]?.memory || {}
    const engine = new AdaptiveEngine({ state: memory.brain })
    if (decision?.choice) {
      engine.observe({
        type: 'decide',
        skillId,
        moduleId,
        payload: { choice: decision.choice, reasoning: decision.reasoning || '' },
      })
    }
    engine.observe({
      type: 'module_complete',
      skillId,
      moduleId,
      payload: {
        score: score ?? scoreData?.overall,
        overall: scoreData?.overall,
        hintsUsed: scoreData?.hintsUsed || 0,
      },
    })
    memory.brain = engine.state
    await pool.query(
      `INSERT INTO student_memory (user_id, memory) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET memory = $2::jsonb`,
      [uid, JSON.stringify(memory)]
    )
  } catch {
    /* brain is best-effort */
  }

  res.json({ ok: true })
})

export default router
