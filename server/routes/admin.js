import { Router } from 'express'
import { pool } from '../db/pool.js'
import { AdaptiveEngine } from '../lib/brain/index.js'
import {
  notFound,
  requireAdminJwt,
  requireAdmin,
  requireAdminOtp,
  readinessScore,
} from '../lib/adminAuth.js'
import { adminOtpError, requestAdminOtp, revokeAdminSession, verifyAdminOtp } from '../lib/adminOtp.js'
import { ownerUser } from '../lib/userFields.js'

const router = Router()

const STUDENT_COLUMNS = `
  id, email, name, degree, bio, username, college_name, track,
  github_id, github_username, github_avatar, linkedin_url,
  headline, location, website, avatar_url, profile_public, profile_confirmed,
  is_admin, last_seen, created_at
`.replace(/\s+/g, ' ').trim()

function studentPublic(row) {
  if (!row) return null
  const user = ownerUser(row)
  return {
    ...user,
    is_admin: Boolean(row.is_admin),
    last_seen: row.last_seen || null,
    created_at: row.created_at || null,
  }
}

router.post('/otp/request', requireAdminJwt, requireAdmin, async (_req, res) => {
  try {
    const result = await requestAdminOtp()
    res.json({
      ok: true,
      retryAfter: result.retryAfter,
      expiresInSeconds: 600,
    })
  } catch (e) {
    return adminOtpError(res, e)
  }
})

router.post('/otp/verify', requireAdminJwt, requireAdmin, async (req, res) => {
  try {
    const result = await verifyAdminOtp(req.user.id, req.body?.code)
    res.json({
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt,
    })
  } catch (e) {
    return adminOtpError(res, e)
  }
})

router.post('/otp/logout', requireAdminJwt, requireAdmin, async (req, res) => {
  try {
    await revokeAdminSession(req.user.id, req.headers['x-admin-session'] || req.body?.token)
    res.json({ ok: true })
  } catch {
    res.json({ ok: true })
  }
})

router.use(requireAdminJwt, requireAdmin, requireAdminOtp)

router.get('/overview', async (_req, res) => {
  try {
    const [users, completed, recent] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM users'),
      pool.query('SELECT COUNT(*)::int AS count FROM completed_modules'),
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE last_seen > NOW() - INTERVAL '7 days'`),
    ])
    res.json({
      label: 'Admin only',
      students: users.rows[0]?.count || 0,
      modules_completed: completed.rows[0]?.count || 0,
      active_7d: recent.rows[0]?.count || 0,
    })
  } catch (e) {
    res.status(500).json({ error: 'Could not load overview' })
  }
})

router.get('/students', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, u.username, u.last_seen, u.track,
        u.github_username, u.profile_public, u.is_admin, u.created_at,
        COUNT(DISTINCT cm.id)::int AS modules_completed,
        COALESCE(AVG(cm.score), 0) AS avg_score,
        (SELECT COUNT(*)::int FROM portfolio p WHERE p.user_id = u.id) AS portfolio_count
      FROM users u
      LEFT JOIN completed_modules cm ON cm.user_id = u.id
      GROUP BY u.id
      ORDER BY u.last_seen DESC NULLS LAST, u.created_at DESC
    `)
    res.json({
      label: 'Admin only',
      students: rows.map(r => ({
        id: r.id,
        name: r.name || '',
        email: r.email,
        username: r.username || '',
        last_seen: r.last_seen || null,
        modules_completed: r.modules_completed || 0,
        track: r.track || 'node',
        readiness: readinessScore(r.modules_completed, r.avg_score, r.portfolio_count),
        github: r.github_username || '',
        profile_public: r.profile_public !== false,
      })),
    })
  } catch (e) {
    res.status(500).json({ error: 'Could not load students' })
  }
})

router.get('/students/:id', async (req, res) => {
  try {
    const id = req.params.id
    const { rows } = await pool.query(
      `SELECT ${STUDENT_COLUMNS} FROM users WHERE id = $1`,
      [id]
    )
    if (!rows[0]) return notFound(res)

    const uid = rows[0].id
    const [session, completed, decisions, scores, portfolio, memory, llmEvents] = await Promise.all([
      pool.query(
        'SELECT skill_id, module_id, step, track, hints_used, started_at FROM user_sessions WHERE user_id = $1',
        [uid]
      ),
      pool.query(
        'SELECT skill_id, module_id, score, track, completed_at FROM completed_modules WHERE user_id = $1 ORDER BY completed_at DESC NULLS LAST',
        [uid]
      ),
      pool.query(
        'SELECT skill_id, module_id, choice, reasoning FROM decisions WHERE user_id = $1',
        [uid]
      ),
      pool.query(
        'SELECT skill_id, module_id, overall, dimensions, narrative FROM scores WHERE user_id = $1',
        [uid]
      ),
      pool.query(
        'SELECT artifact, student_action, technical_detail, proof, ability, confidence, skill_id, module_id, recorded_at FROM portfolio WHERE user_id = $1 ORDER BY recorded_at DESC',
        [uid]
      ),
      pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [uid]),
      pool.query(
        `SELECT type, skill_id, module_id, step, created_at
         FROM llm_interactions WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [uid]
      ).catch(() => ({ rows: [] })),
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

    const memoryJson = memory.rows[0]?.memory || {}
    let brainSnapshot = null
    try {
      const engine = new AdaptiveEngine({ state: memoryJson.brain })
      brainSnapshot = engine.snapshot()
    } catch {
      brainSnapshot = null
    }

    const events = [
      ...completed.rows.map(r => ({
        type: 'module_complete',
        at: r.completed_at,
        skill_id: r.skill_id,
        module_id: r.module_id,
        detail: r.score != null ? `score ${r.score}` : '',
      })),
      ...decisions.rows.map(r => ({
        type: 'decide',
        at: null,
        skill_id: r.skill_id,
        module_id: r.module_id,
        detail: r.choice,
      })),
      ...llmEvents.rows.map(r => ({
        type: `llm_${r.type}`,
        at: r.created_at,
        skill_id: r.skill_id,
        module_id: r.module_id,
        detail: r.step || r.type,
      })),
      ...(session.rows[0] ? [{
        type: 'session',
        at: session.rows[0].started_at,
        skill_id: session.rows[0].skill_id,
        module_id: session.rows[0].module_id,
        detail: session.rows[0].step,
      }] : []),
    ].sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 40)

    const sess = session.rows[0]
    const modulesCompleted = completed.rows.length
    const avgScore = completed.rows.length
      ? completed.rows.reduce((s, r) => s + Number(r.score || 0), 0) / completed.rows.length
      : 0

    res.json({
      label: 'Admin only',
      profile: studentPublic(rows[0]),
      readiness: readinessScore(modulesCompleted, avgScore, portfolio.rows.length),
      progress: {
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
        studentMemory: memoryJson,
      },
      brain: {
        state: memoryJson.brain || null,
        snapshot: brainSnapshot,
      },
      events,
    })
  } catch (e) {
    res.status(500).json({ error: 'Could not load student' })
  }
})

router.use((_req, res) => notFound(res))

export default router
