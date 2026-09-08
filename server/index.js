import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import { pool, initDb } from './db/pool.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:5173'

app.use(cors({ origin: [FRONTEND, 'http://localhost:5173'], credentials: true }))
app.use(express.json())

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, degree, bio, username, college, track } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, degree, bio, username, college_name, track, profile_confirmed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id, email, name, degree, bio, username, college_name, track`,
      [email, hash, name || '', degree || '', bio || '', username || email.split('@')[0], college || '', track || 'node']
    )
    const user = rows[0]
    await pool.query('INSERT INTO student_memory (user_id, memory) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, JSON.stringify({ effective_level: 'beginner' })])
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, user })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or username already exists' })
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, rows[0].password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const user = rows[0]
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, degree: user.degree, bio: user.bio, username: user.username, college_name: user.college_name, track: user.track } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/auth/me', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, email, name, degree, bio, username, college_name, track FROM users WHERE id = $1', [req.user.id])
  res.json(rows[0] || null)
})

app.get('/api/progress', auth, async (req, res) => {
  const uid = req.user.id
  const [user, session, completed, decisions, scores, portfolio, memory] = await Promise.all([
    pool.query('SELECT id, email, name, degree, bio, username, college_name, track, profile_confirmed FROM users WHERE id = $1', [uid]),
    pool.query('SELECT * FROM user_sessions WHERE user_id = $1', [uid]),
    pool.query('SELECT skill_id, module_id, score, track, completed_at FROM completed_modules WHERE user_id = $1', [uid]),
    pool.query('SELECT skill_id, module_id, choice, reasoning FROM decisions WHERE user_id = $1', [uid]),
    pool.query('SELECT skill_id, module_id, overall, dimensions, narrative FROM scores WHERE user_id = $1', [uid]),
    pool.query('SELECT * FROM portfolio WHERE user_id = $1 ORDER BY recorded_at DESC', [uid]),
    pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [uid]),
  ])
  const completedModules = {}
  completed.rows.forEach(r => { completedModules[`${r.skill_id}:${r.module_id}`] = r })
  const decisionsMap = {}
  decisions.rows.forEach(r => { decisionsMap[`${r.skill_id}:${r.module_id}`] = r.choice })
  const scoresMap = {}
  scores.rows.forEach(r => { scoresMap[`${r.skill_id}:${r.module_id}`] = r })
  res.json({
    profile: user.rows[0],
    session: session.rows[0] || null,
    completedModules,
    decisions: decisionsMap,
    scores: scoresMap,
    portfolio: portfolio.rows,
    studentMemory: memory.rows[0]?.memory || {},
  })
})

app.put('/api/progress/session', auth, async (req, res) => {
  const { skillId, moduleId, step, track, hintsUsed } = req.body
  await pool.query(
    `INSERT INTO user_sessions (user_id, skill_id, module_id, step, track, hints_used)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id) DO UPDATE SET skill_id=$2, module_id=$3, step=$4, track=$5, hints_used=$6, started_at=NOW()`,
    [req.user.id, skillId, moduleId, step, track || 'node', hintsUsed || 0]
  )
  res.json({ ok: true })
})

app.get('/api/profile/:username', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, degree, bio, username, college_name, track FROM users WHERE username = $1',
    [req.params.username]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  const uid = rows[0].id
  const [portfolio, completed] = await Promise.all([
    pool.query('SELECT artifact, student_action, proof, ability, confidence FROM portfolio WHERE user_id = $1 LIMIT 10', [uid]),
    pool.query('SELECT COUNT(*)::int AS count FROM completed_modules WHERE user_id = $1', [uid]),
  ])
  res.json({ ...rows[0], portfolio: portfolio.rows, modules_completed: completed.rows[0].count })
})

app.get('/api/leaderboard', async (_, res) => {
  const { rows } = await pool.query(`
    SELECT u.username, u.name, u.college_name,
      COUNT(cm.id)::int AS modules_completed,
      COALESCE(AVG(cm.score), 0) AS avg_score
    FROM users u
    LEFT JOIN completed_modules cm ON cm.user_id = u.id
    GROUP BY u.id
    ORDER BY modules_completed DESC, avg_score DESC
    LIMIT 20
  `)
  res.json({ entries: rows.map((r, i) => ({ ...r, rank: i + 1, readiness_score: Math.min(100, r.modules_completed * 8 + Math.round(r.avg_score * 10)) })) })
})

async function start() {
  if (process.env.DATABASE_URL) {
    try { await initDb(); console.log('Database ready') } catch (e) { console.warn('DB init skipped:', e.message) }
  }
  app.listen(PORT, () => console.log(`LearnLab API on :${PORT}`))
}

start()
