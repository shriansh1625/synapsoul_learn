import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT u.username, u.name, u.college_name, u.degree,
      COUNT(cm.id)::int AS modules_completed,
      COALESCE(AVG(cm.score), 0) AS avg_score,
      (SELECT COUNT(*)::int FROM portfolio p WHERE p.user_id = u.id) AS portfolio_count
    FROM users u
    LEFT JOIN completed_modules cm ON cm.user_id = u.id
    WHERE u.profile_public IS NOT FALSE
      AND u.username IS NOT NULL
      AND u.username <> ''
    GROUP BY u.id
    ORDER BY modules_completed DESC, avg_score DESC
    LIMIT 20
  `)
  res.json({
    entries: rows.map((r, i) => ({
      ...r,
      rank: i + 1,
      headline: `${r.college_name || 'LearnLab'} · ${r.degree || ''}`.trim(),
      readiness_score: Math.min(100, r.modules_completed * 8 + Math.round(Number(r.avg_score) * 10) + Math.min(r.portfolio_count * 4, 20)),
    })),
  })
})

export default router
