import { Router } from 'express'
import { createHash } from 'node:crypto'
import { auth } from '../middleware/auth.js'
import { pool } from '../db/pool.js'
import { NVIDIA_MODEL, REVIEW_LIMITS, checkReviewBudget, validateReasoning, loadDecisionModule, reviewDecision } from '../lib/llm/nemotronDecision.js'
export function createNvidiaRouter({ database = pool, generate = reviewDecision, authenticate = auth, isConfigured = () => Boolean(process.env.NVIDIA_API_KEY) } = {}) {
const router = Router()
router.get('/status', (_, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ enabled: isConfigured(), model: NVIDIA_MODEL, limits: REVIEW_LIMITS })
})
router.post('/decision-review', authenticate, async (req, res) => {
  try {
    if (!isConfigured()) return res.status(503).json({ error: 'NVIDIA coach is not configured yet.' })
    if (req.body?.consent !== true) return res.status(400).json({ error: 'Confirm that you want to send this explanation to NVIDIA for review.' })
    const reasoning = validateReasoning(req.body.reasoning)
    const { rows: sessions } = await database.query('SELECT skill_id, module_id, step, source FROM user_sessions WHERE user_id = $1', [req.user.id])
    const session = sessions[0]
    if (!session || session.source !== 'cli' || !['DECIDE', 'BUILD', 'VERIFY', 'BREAK', 'FIX', 'REFLECT'].includes(session.step)) {
      return res.status(409).json({ error: 'Start your CLI session and reach DECIDE before requesting a review.' })
    }
    const module = await loadDecisionModule(session.skill_id, session.module_id)
    // Serialize quota reservations across web instances; include pending/failed attempts.
    const client = await database.connect()
    let interactionId
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(1163, 7925)')
      const { rows } = await client.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE user_id = $1)::int AS mine,
        EXTRACT(EPOCH FROM (NOW() - MAX(created_at) FILTER (WHERE user_id = $1))) AS seconds
        FROM llm_interactions WHERE provider = 'nvidia-decision' AND created_at >= date_trunc('day', NOW())`, [req.user.id])
      checkReviewBudget({ total: rows[0].total, mine: rows[0].mine, secondsSinceLast: rows[0].seconds == null ? null : Number(rows[0].seconds) })
      const inserted = await client.query(`INSERT INTO llm_interactions (user_id,type,skill_id,module_id,step,prompt_hash,provider,model,context_json)
        VALUES ($1,'coach',$2,$3,$4,$5,'nvidia-decision',$6,'{"feature":"decision-review","status":"reserved"}') RETURNING id`,
        [req.user.id, session.skill_id, session.module_id, session.step, createHash('sha256').update(reasoning).digest('hex'), NVIDIA_MODEL])
      interactionId = inserted.rows[0].id
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
    const result = await generate({ module, reasoning })
    await database.query(`UPDATE llm_interactions SET context_json = '{"feature":"decision-review","status":"completed"}' WHERE id = $1 AND user_id = $2`, [interactionId, req.user.id])
    res.set('Cache-Control', 'no-store')
    res.json(result)
  } catch (error) {
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter))
    const status = [400, 409, 429, 503].includes(error.status) ? error.status : 503
    res.status(status).json({ error: status === 503 && !error.status ? 'The coach is unavailable right now. Try again shortly.' : error.message })
  }
})
return router
}
export default createNvidiaRouter()
