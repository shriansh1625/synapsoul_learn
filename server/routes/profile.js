import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

function computeReadiness(modulesCompleted, avgScore, portfolioCount) {
  const completion = Math.min(modulesCompleted * 8, 40)
  const scorePart = Math.round((avgScore || 0) * 10)
  const port = Math.min((portfolioCount || 0) * 4, 20)
  return Math.min(100, completion + scorePart + port)
}

router.get('/:username', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, degree, bio, username, college_name, track FROM users WHERE username = $1',
    [req.params.username]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  const uid = rows[0].id
  const [portfolio, completed, scores] = await Promise.all([
    pool.query('SELECT artifact, student_action, proof, ability, confidence FROM portfolio WHERE user_id = $1 LIMIT 10', [uid]),
    pool.query('SELECT COUNT(*)::int AS count FROM completed_modules WHERE user_id = $1', [uid]),
    pool.query('SELECT overall, dimensions FROM scores WHERE user_id = $1', [uid]),
  ])

  const avgScore = scores.rows.length
    ? scores.rows.reduce((a, s) => a + Number(s.overall || 0), 0) / scores.rows.length
    : 0

  const headline_dimensions = scores.rows.slice(0, 5).flatMap(s => {
    const dims = s.dimensions || {}
    return Object.entries(dims).slice(0, 2).map(([id, score]) => ({ id, label: id.replace(/_/g, ' '), score }))
  })

  res.json({
    ...rows[0],
    headline: rows[0].bio,
    portfolio: portfolio.rows,
    modules_completed: completed.rows[0].count,
    skills_completed: Math.floor(completed.rows[0].count / 3),
    readiness_score: computeReadiness(completed.rows[0].count, avgScore, portfolio.rows.length),
    headline_dimensions,
    badges: [],
  })
})

export default router
