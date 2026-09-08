import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'
import { auth, signToken } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
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
    await pool.query(
      'INSERT INTO student_memory (user_id, memory) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.id, JSON.stringify({ effective_level: 'beginner' })]
    )
    res.json({ token: signToken(user), user })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or username already exists' })
    res.status(500).json({ error: e.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, rows[0].password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const user = rows[0]
    res.json({
      token: signToken(user),
      user: {
        id: user.id, email: user.email, name: user.name, degree: user.degree,
        bio: user.bio, username: user.username, college_name: user.college_name, track: user.track,
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/me', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, name, degree, bio, username, college_name, track FROM users WHERE id = $1',
    [req.user.id]
  )
  res.json(rows[0] || null)
})

router.post('/github', (_req, res) => {
  res.status(501).json({ error: 'GitHub OAuth coming soon' })
})

export default router
