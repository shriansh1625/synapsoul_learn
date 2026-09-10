import { Router } from 'express'
import { pool } from '../db/pool.js'
import { auth } from '../middleware/auth.js'
import {
  OWNER_COLUMNS,
  ownerUser,
  displayAvatar,
  sanitizeHandle,
  isHttpUrl,
  normalizeLinkedInUrl,
  githubProfileUrl,
} from '../lib/userFields.js'
import { AdaptiveEngine, publicGraphSummary, maybeEnrichHiring } from '../lib/brain/index.js'
import { groqComplete } from '../lib/llm/providers/groq.js'
import { mirrorObserveFireAndForget } from '../lib/learning/ServerLearnerMirror.js'

const router = Router()

const SKILL_META = [
  { id: 'system-design-fundamentals', title: 'System Design Fundamentals', moduleCount: 5 },
  { id: 'debugging-incidents', title: 'Debugging & Incident Response', moduleCount: 3 },
  { id: 'decomposition-planning', title: 'Decomposition & Execution Planning', moduleCount: 3 },
  { id: 'production-readiness', title: 'Production Readiness', moduleCount: 3 },
  { id: 'ai-augmented-engineering', title: 'AI-Augmented Engineering', moduleCount: 3 },
  { id: 'technical-communication', title: 'Technical Communication', moduleCount: 3 },
  { id: 'system-design', title: 'System Design (Advanced)', moduleCount: 2 },
]

const DIMENSION_LABELS = {
  tradeoff_reasoning: 'Tradeoff Reasoning',
  production_thinking: 'Production Thinking',
  hypothesis_quality: 'Hypothesis Quality',
  root_cause_depth: 'Root Cause Depth',
  task_clarity: 'Task Clarity',
  adaptation_speed: 'Adaptation Speed',
  review_thoroughness: 'Review Thoroughness',
  engineering_judgment: 'Engineering Judgment',
  failure_thinking: 'Failure Thinking',
  observability_coverage: 'Observability',
  communication_clarity: 'Communication',
  writing_clarity: 'Writing Clarity',
  debugging_methodology: 'Debugging Methodology',
  security_awareness: 'Security Awareness',
}

function computeReadiness(modulesCompleted, avgScore, portfolioCount) {
  const completion = Math.min(modulesCompleted * 8, 40)
  const scorePart = Math.round((avgScore || 0) * 10)
  const port = Math.min((portfolioCount || 0) * 4, 20)
  return Math.min(100, completion + scorePart + port)
}

function dimensionAverages(scoreRows) {
  const totals = {}
  const counts = {}
  for (const row of scoreRows) {
    const dims = row.dimensions || {}
    for (const [id, val] of Object.entries(dims)) {
      const n = Number(val)
      if (!Number.isFinite(n) || n < 1 || n > 5) continue
      totals[id] = (totals[id] || 0) + n
      counts[id] = (counts[id] || 0) + 1
    }
  }
  return Object.keys(totals)
    .map(id => ({
      id,
      label: DIMENSION_LABELS[id] || id.replace(/_/g, ' '),
      score: Math.round((totals[id] / counts[id]) * 10) / 10,
      samples: counts[id],
    }))
    .sort((a, b) => b.score - a.score)
}

router.put('/', auth, async (req, res) => {
  try {
    const body = req.body || {}
    const { rows: currentRows } = await pool.query(`SELECT ${OWNER_COLUMNS} FROM users WHERE id = $1`, [req.user.id])
    if (!currentRows[0]) return res.status(404).json({ error: 'Not found' })

    let username = currentRows[0].username
    if (body.username != null) {
      const next = sanitizeHandle(body.username)
      if (!next || next.length < 2) {
        return res.status(400).json({ error: 'Username must be 2–32 letters, numbers, hyphens, or underscores' })
      }
      const taken = await pool.query('SELECT id FROM users WHERE username = $1 AND id <> $2', [next, req.user.id])
      if (taken.rows[0]) return res.status(409).json({ error: 'Username already taken' })
      username = next
    } else if (!String(username || '').trim()) {
      return res.status(400).json({ error: 'Choose a public username before saving your profile' })
    }

    const linkedin_url = body.linkedin_url != null
      ? normalizeLinkedInUrl(body.linkedin_url)
      : (currentRows[0].linkedin_url || '')
    const website = body.website != null ? String(body.website).trim() : (currentRows[0].website || '')
    const avatar_url = body.avatar_url != null ? String(body.avatar_url).trim() : (currentRows[0].avatar_url || '')

    if (linkedin_url && !isHttpUrl(linkedin_url)) {
      return res.status(400).json({ error: 'LinkedIn URL must be a valid http(s) link' })
    }
    if (website && !isHttpUrl(website)) {
      return res.status(400).json({ error: 'Website must be a valid http(s) link' })
    }
    if (avatar_url && !isHttpUrl(avatar_url)) {
      return res.status(400).json({ error: 'Avatar URL must be a valid http(s) link' })
    }

    const github_username = body.github_username != null
      ? String(body.github_username).trim().replace(/^@/, '').replace(/.*github\.com\//i, '').replace(/\/.*$/, '')
      : (currentRows[0].github_username || '')

    const profile_public = body.profile_public == null
      ? currentRows[0].profile_public !== false
      : Boolean(body.profile_public)

    const { rows } = await pool.query(
      `UPDATE users SET
         name = $2,
         bio = $3,
         headline = $4,
         degree = $5,
         college_name = $6,
         username = $7,
         location = $8,
         website = $9,
         linkedin_url = $10,
         github_username = $11,
         avatar_url = $12,
         profile_public = $13
       WHERE id = $1
       RETURNING ${OWNER_COLUMNS}`,
      [
        req.user.id,
        body.name != null ? String(body.name).trim() : (currentRows[0].name || ''),
        body.bio != null ? String(body.bio).trim() : (currentRows[0].bio || ''),
        body.headline != null ? String(body.headline).trim() : (currentRows[0].headline || ''),
        body.degree != null ? String(body.degree).trim() : (currentRows[0].degree || ''),
        body.college != null || body.college_name != null
          ? String(body.college ?? body.college_name).trim()
          : (currentRows[0].college_name || ''),
        username,
        body.location != null ? String(body.location).trim() : (currentRows[0].location || ''),
        website,
        linkedin_url,
        github_username,
        avatar_url,
        profile_public,
      ]
    )
    const user = ownerUser(rows[0])
    mirrorObserveFireAndForget(req.user.id, {
      type: 'profile_update',
      source: 'website',
      command: 'profile update',
    }, {
      progress: { profile: user },
    })
    res.json({ user })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Username already taken' })
    res.status(500).json({ error: 'Could not save your profile. Try again.' })
  }
})

router.get('/:username', async (req, res) => {
  const slug = sanitizeHandle(decodeURIComponent(req.params.username || ''))
  if (!slug || slug.length < 2) return res.status(404).json({ error: 'Not found' })
  const { rows } = await pool.query(
    `SELECT ${OWNER_COLUMNS} FROM users WHERE lower(username) = lower($1)`,
    [slug]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Not found' })
  if (rows[0].profile_public === false) return res.status(404).json({ error: 'Not found' })

  const user = ownerUser(rows[0])
  const uid = user.id
  const [portfolio, completed, scores, bySkill, recent] = await Promise.all([
    pool.query(
      'SELECT artifact, student_action, proof, ability, confidence, technical_detail, skill_id, module_id FROM portfolio WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 12',
      [uid]
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM completed_modules WHERE user_id = $1', [uid]),
    pool.query('SELECT overall, dimensions FROM scores WHERE user_id = $1', [uid]),
    pool.query(
      'SELECT skill_id, COUNT(*)::int AS count FROM completed_modules WHERE user_id = $1 GROUP BY skill_id',
      [uid]
    ),
    pool.query(
      `SELECT skill_id, module_id, score, completed_at
       FROM completed_modules WHERE user_id = $1
       ORDER BY completed_at DESC NULLS LAST LIMIT 8`,
      [uid]
    ),
  ])

  const completedBySkill = Object.fromEntries(bySkill.rows.map(r => [r.skill_id, r.count]))
  const skill_progress = SKILL_META.map(skill => {
    const done = completedBySkill[skill.id] || 0
    return {
      id: skill.id,
      title: skill.title,
      completed: done,
      total: skill.moduleCount,
      percent: skill.moduleCount ? Math.round((done / skill.moduleCount) * 100) : 0,
    }
  })
  const badges = skill_progress
    .filter(s => s.completed >= s.total && s.total > 0)
    .map(s => ({ id: s.id, title: s.title }))

  const avgScore = scores.rows.length
    ? scores.rows.reduce((a, s) => a + Number(s.overall || 0), 0) / scores.rows.length
    : 0

  const headline_dimensions = dimensionAverages(scores.rows)
  const modulesCompleted = completed.rows[0].count
  const skillsCompleted = skill_progress.filter(s => s.completed >= s.total && s.total > 0).length
  const github_username = user.github_username || ''

  let cognitive_graph = null
  try {
    const mem = await pool.query('SELECT memory FROM student_memory WHERE user_id = $1', [uid])
    const engine = new AdaptiveEngine({ state: mem.rows[0]?.memory?.brain })
    const snap = engine.snapshot()
    let hiring = snap.graph?.hiring
    if (process.env.GROQ_API_KEY && snap.graph) {
      hiring = await maybeEnrichHiring(snap.graph, { groqComplete })
    }
    cognitive_graph = publicGraphSummary({ ...snap.graph, hiring })
  } catch {
    cognitive_graph = publicGraphSummary(null)
  }

  res.json({
    name: user.name,
    username: user.username,
    degree: user.degree,
    college_name: user.college_name,
    bio: user.bio,
    headline: user.headline || user.bio,
    track: user.track,
    location: user.location,
    website: user.website,
    linkedin_url: user.linkedin_url,
    github_username,
    github_url: githubProfileUrl(github_username),
    avatar_url: displayAvatar(user),
    portfolio: portfolio.rows,
    modules_completed: modulesCompleted,
    skills_completed: skillsCompleted,
    skills_total: SKILL_META.length,
    evidence_count: portfolio.rows.length,
    readiness_score: computeReadiness(modulesCompleted, avgScore, portfolio.rows.length),
    headline_dimensions,
    skill_progress,
    badges,
    recent_modules: recent.rows.map(r => ({
      skill_id: r.skill_id,
      module_id: r.module_id,
      score: r.score,
      completed_at: r.completed_at,
      title: (SKILL_META.find(s => s.id === r.skill_id)?.title || r.skill_id || '').replace(/-/g, ' '),
      module_label: String(r.module_id || '').replace(/-/g, ' '),
    })),
    cognitive_graph,
  })
})

export default router
