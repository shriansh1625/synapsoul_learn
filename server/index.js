import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { pool, initDb } from './db/pool.js'
import authRoutes from './routes/auth.js'
import progressRoutes from './routes/progress.js'
import profileRoutes from './routes/profile.js'
import leaderboardRoutes from './routes/leaderboard.js'
import brainRoutes from './routes/brain.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function normalizeOrigin(origin) {
  return origin?.replace(/\/$/, '') || ''
}

function parseFrontendOrigins() {
  return (process.env.FRONTEND_URL || '')
    .split(',')
    .map(s => normalizeOrigin(s.trim()))
    .filter(Boolean)
}

function isAllowedOrigin(origin) {
  const normalized = normalizeOrigin(origin)
  if (LOCAL_ORIGINS.includes(normalized)) return true
  if (parseFrontendOrigins().includes(normalized)) return true
  // Vercel production + preview deployments (trailing slash normalized above)
  if (/^https:\/\/tutor-alpha-sandy[\w-]*\.vercel\.app$/.test(normalized)) return true
  if (/^https:\/\/[\w-]+\.vercel\.app$/.test(normalized)) return true
  return false
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) callback(null, origin || true)
    else callback(null, false)
  },
  credentials: true,
}))
app.use(express.json())

app.get('/api/health', (_, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/brain', brainRoutes)

async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initDb()
      console.log('Database ready')
    } catch (e) {
      console.warn('DB init skipped:', e.message)
    }
  } else {
    console.warn('DATABASE_URL not set — auth/progress endpoints will fail until configured')
  }
  app.listen(PORT, () => console.log(`LearnLab API on :${PORT}`))
}

start()
