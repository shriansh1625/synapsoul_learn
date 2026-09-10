import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'
import { auth, signToken } from '../middleware/auth.js'
import { OWNER_COLUMNS, ownerUser, sanitizeHandle } from '../lib/userFields.js'
import {
  githubConfigured,
  linkedinConfigured,
  wantsJson,
  frontendRedirect,
  githubAuthorizeUrl,
  linkedinAuthorizeUrl,
  signOAuthState,
  readOAuthState,
  exchangeGithubCode,
  exchangeLinkedInCode,
  frontendOrigin,
} from '../lib/oauth.js'
import { touchLastSeen, promoteIfAdminEmail, emailIsAdmin } from '../lib/adminAuth.js'
import { parseCliNonce, putCliToken, takeCliToken } from '../lib/cliAuth.js'
import { mirrorObserveFireAndForget } from '../lib/learning/ServerLearnerMirror.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

async function uniqueUsername(base, excludeId) {
  const seed = sanitizeHandle(base, `builder-${Date.now().toString(36).slice(-6)}`)
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? seed : `${seed.slice(0, 24)}-${i + 1}`
    const { rows } = excludeId
      ? await pool.query('SELECT id FROM users WHERE username = $1 AND id <> $2', [candidate, excludeId])
      : await pool.query('SELECT id FROM users WHERE username = $1', [candidate])
    if (!rows[0]) return candidate
  }
  return `${seed.slice(0, 20)}-${Date.now().toString(36).slice(-6)}`
}

async function loadOwnerById(id) {
  const { rows } = await pool.query(`SELECT ${OWNER_COLUMNS} FROM users WHERE id = $1`, [id])
  return ownerUser(rows[0])
}

async function findGithubUser(githubId, email) {
  const byGh = await pool.query(`SELECT ${OWNER_COLUMNS} FROM users WHERE github_id = $1`, [githubId])
  if (byGh.rows[0]) return ownerUser(byGh.rows[0])
  if (email) {
    const byEmail = await pool.query(`SELECT ${OWNER_COLUMNS} FROM users WHERE email = $1`, [email])
    if (byEmail.rows[0]) return ownerUser(byEmail.rows[0])
  }
  return null
}

async function createGithubUser(profile) {
  const username = await uniqueUsername(profile.github_username || profile.email?.split('@')[0])
  const { rows } = await pool.query(
    `INSERT INTO users (
       email, password_hash, name, bio, username, location, website,
       github_id, github_username, github_avatar, avatar_url, profile_confirmed, profile_public, is_admin
     ) VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$9,true,true,$10)
     RETURNING ${OWNER_COLUMNS}`,
    [
      profile.email,
      profile.name || '',
      profile.bio || '',
      username,
      profile.location || '',
      profile.website || '',
      profile.github_id,
      profile.github_username,
      profile.github_avatar || '',
      emailIsAdmin(profile.email),
    ]
  )
  await pool.query(
    'INSERT INTO student_memory (user_id, memory) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [rows[0].id, JSON.stringify({ effective_level: 'beginner' })]
  )
  return ownerUser(rows[0])
}

async function attachGithub(userId, profile) {
  const taken = await pool.query(
    'SELECT id FROM users WHERE github_id = $1 AND id <> $2',
    [profile.github_id, userId]
  )
  if (taken.rows[0]) {
    const err = new Error('This GitHub account is already connected to another SynapSoul user')
    err.status = 409
    throw err
  }
  const current = await loadOwnerById(userId)
  await pool.query(
    `UPDATE users SET
       github_id = $2,
       github_username = $3,
       github_avatar = $4,
       avatar_url = CASE WHEN avatar_url IS NULL OR avatar_url = '' THEN $4 ELSE avatar_url END,
       location = CASE WHEN location IS NULL OR location = '' THEN $5 ELSE location END,
       website = CASE WHEN website IS NULL OR website = '' THEN $6 ELSE website END
     WHERE id = $1`,
    [userId, profile.github_id, profile.github_username, profile.github_avatar || '', profile.location || '', profile.website || '']
  )
  return loadOwnerById(userId) || current
}

function parseConnectToken(req) {
  const raw = req.query.token || req.query.connect_token
  if (!raw) return null
  try {
    return jwt.verify(String(raw), JWT_SECRET)
  } catch {
    return null
  }
}

router.get('/providers', (_req, res) => {
  res.json({
    github: githubConfigured(),
    linkedin: linkedinConfigured(),
  })
})

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, degree, bio, username, college, track } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
    const hash = await bcrypt.hash(password, 10)
    const handle = await uniqueUsername(username || email.split('@')[0])
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, degree, bio, username, college_name, track, profile_confirmed, profile_public, is_admin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9) RETURNING ${OWNER_COLUMNS}`,
      [email, hash, name || '', degree || '', bio || '', handle, college || '', track || 'node', emailIsAdmin(email)]
    )
    const user = ownerUser(rows[0])
    await pool.query(
      'INSERT INTO student_memory (user_id, memory) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.id, JSON.stringify({ effective_level: 'beginner' })]
    )
    await promoteIfAdminEmail(user)
    await touchLastSeen(user.id)
    mirrorObserveFireAndForget(user.id, { type: 'session_start', source: 'website', command: 'register' }, {
      progress: { profile: user },
    })
    res.json({ token: signToken(user), user })
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or username already exists' })
    res.status(500).json({ error: 'Could not create your account. Try again.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const { rows } = await pool.query(`SELECT password_hash, ${OWNER_COLUMNS} FROM users WHERE email = $1`, [email])
    if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' })
    if (!rows[0].password_hash) {
      return res.status(401).json({ error: 'This account uses GitHub sign-in. Continue with GitHub instead.' })
    }
    const ok = await bcrypt.compare(password, rows[0].password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })
    const user = ownerUser(rows[0])
    await promoteIfAdminEmail(user)
    await touchLastSeen(user.id)
    mirrorObserveFireAndForget(user.id, { type: 'session_start', source: 'website', command: 'login' }, {
      progress: { profile: user },
    })
    res.json({ token: signToken(user), user })
  } catch (e) {
    res.status(500).json({ error: 'Could not sign in. Try again.' })
  }
})

router.get('/me', auth, async (req, res) => {
  const user = await loadOwnerById(req.user.id)
  if (user) {
    await promoteIfAdminEmail(user)
    await touchLastSeen(user.id)
  }
  res.json(user)
})

router.get('/cli-poll', async (req, res) => {
  const nonce = parseCliNonce(req)
  if (!nonce) return res.json({ pending: true })
  const result = await takeCliToken(nonce)
  if (result.token) return res.json({ pending: false, token: result.token, user: result.user })
  return res.json({ pending: true })
})

router.get('/github', (req, res) => {
  const cliNonce = parseCliNonce(req)
  if (!githubConfigured()) {
    const payload = {
      configured: false,
      provider: 'github',
      message: `GitHub OAuth is not configured. Use the website: ${frontendOrigin()}`,
      site: frontendOrigin(),
    }
    if (wantsJson(req) || req.query.cli === '1' || cliNonce) return res.json(payload)
    return res.redirect(frontendRedirect({ github: 'setup' }))
  }

  const connectUser = parseConnectToken(req)
  const mode = (req.query.connect === '1' || connectUser) ? 'connect' : 'login'
  if (mode === 'connect' && !connectUser?.id) {
    const payload = { configured: true, error: 'Sign in before connecting GitHub' }
    if (wantsJson(req)) return res.status(401).json(payload)
    return res.redirect(frontendRedirect({ error: 'signin_required', provider: 'github' }))
  }

  const state = signOAuthState({
    provider: 'github',
    mode,
    userId: connectUser?.id || null,
    cliNonce: cliNonce || null,
  })
  const url = githubAuthorizeUrl(req, state)
  if (wantsJson(req)) return res.json({ configured: true, url, nonce: cliNonce || undefined })
  res.redirect(url)
})

router.get('/github/callback', async (req, res) => {
  if (!githubConfigured()) {
    return res.redirect(frontendRedirect({ github: 'setup' }))
  }
  if (req.query.error) {
    return res.redirect(frontendRedirect({ error: String(req.query.error), provider: 'github' }))
  }
  const code = req.query.code
  if (!code) return res.redirect(frontendRedirect({ error: 'missing_code', provider: 'github' }))

  const state = readOAuthState(req.query.state)
  try {
    const profile = await exchangeGithubCode(req, code)
    let user
    if (state.mode === 'connect' && state.userId) {
      user = await attachGithub(state.userId, profile)
    } else {
      user = await findGithubUser(profile.github_id, profile.email)
      if (user) {
        if (!user.github_id) user = await attachGithub(user.id, profile)
      } else {
        try {
          user = await createGithubUser(profile)
        } catch (e) {
          if (e.code === '23505') {
            user = await findGithubUser(profile.github_id, profile.email)
            if (user) user = await attachGithub(user.id, profile)
            else throw e
          } else {
            throw e
          }
        }
      }
    }
    const token = signToken(user)
    await promoteIfAdminEmail(user)
    await touchLastSeen(user.id)
    if (state.cliNonce) {
      await putCliToken(state.cliNonce, { token, user })
    }
    return res.redirect(frontendRedirect({
      token,
      provider: 'github',
      connected: state.mode === 'connect' ? '1' : '0',
      cli: state.cliNonce ? '1' : undefined,
      nonce: state.cliNonce || undefined,
    }))
  } catch (e) {
    const status = e.status || 500
    if (status === 409) return res.redirect(frontendRedirect({ error: 'github_taken', provider: 'github' }))
    console.error('GitHub OAuth callback', e.message)
    return res.redirect(frontendRedirect({ error: 'github_oauth_failed', provider: 'github' }))
  }
})

router.get('/linkedin', (req, res) => {
  if (!linkedinConfigured()) {
    const payload = {
      configured: false,
      provider: 'linkedin',
      message: 'LinkedIn OAuth is not configured. You can still paste a LinkedIn URL on your profile. To enable OAuth, set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_CALLBACK_URL.',
    }
    if (wantsJson(req)) return res.json(payload)
    return res.redirect(frontendRedirect({ linkedin: 'setup' }))
  }

  const connectUser = parseConnectToken(req)
  const mode = (req.query.connect === '1' || connectUser) ? 'connect' : 'login'
  if (mode === 'connect' && !connectUser?.id) {
    if (wantsJson(req)) return res.status(401).json({ configured: true, error: 'Sign in before connecting LinkedIn' })
    return res.redirect(frontendRedirect({ error: 'signin_required', provider: 'linkedin' }))
  }

  const state = signOAuthState({
    provider: 'linkedin',
    mode,
    userId: connectUser?.id || null,
  })
  const url = linkedinAuthorizeUrl(req, state)
  if (wantsJson(req)) return res.json({ configured: true, url })
  res.redirect(url)
})

router.get('/linkedin/callback', async (req, res) => {
  if (!linkedinConfigured()) {
    return res.redirect(frontendRedirect({ linkedin: 'setup' }))
  }
  if (req.query.error) {
    return res.redirect(frontendRedirect({ error: String(req.query.error), provider: 'linkedin' }))
  }
  const code = req.query.code
  if (!code) return res.redirect(frontendRedirect({ error: 'missing_code', provider: 'linkedin' }))

  const state = readOAuthState(req.query.state)
  try {
    const profile = await exchangeLinkedInCode(req, code)
    let user = null

    if (state.mode === 'connect' && state.userId) {
      user = await loadOwnerById(state.userId)
    } else if (profile.email) {
      const { rows } = await pool.query(`SELECT ${OWNER_COLUMNS} FROM users WHERE email = $1`, [profile.email])
      user = ownerUser(rows[0])
    }

    if (!user && profile.email) {
      const username = await uniqueUsername(profile.email.split('@')[0])
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, name, username, avatar_url, linkedin_url, profile_confirmed, profile_public, is_admin)
         VALUES ($1,NULL,$2,$3,$4,$5,true,true,$6) RETURNING ${OWNER_COLUMNS}`,
        [profile.email, profile.name || '', username, profile.avatar_url || '', profile.linkedin_url || '', emailIsAdmin(profile.email)]
      )
      await pool.query(
        'INSERT INTO student_memory (user_id, memory) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [rows[0].id, JSON.stringify({ effective_level: 'beginner' })]
      )
      user = ownerUser(rows[0])
    } else if (user) {
      await pool.query(
        `UPDATE users SET
           linkedin_url = CASE WHEN $2 <> '' THEN $2 ELSE linkedin_url END,
           avatar_url = CASE WHEN (avatar_url IS NULL OR avatar_url = '') AND $3 <> '' THEN $3 ELSE avatar_url END
         WHERE id = $1`,
        [user.id, profile.linkedin_url || '', profile.avatar_url || '']
      )
      user = await loadOwnerById(user.id)
    } else {
      return res.redirect(frontendRedirect({ error: 'linkedin_email_required', provider: 'linkedin' }))
    }

    const token = signToken(user)
    await promoteIfAdminEmail(user)
    await touchLastSeen(user.id)
    return res.redirect(frontendRedirect({
      token,
      provider: 'linkedin',
      connected: state.mode === 'connect' ? '1' : '0',
    }))
  } catch (e) {
    console.error('LinkedIn OAuth callback', e.message)
    return res.redirect(frontendRedirect({ error: 'linkedin_oauth_failed', provider: 'linkedin' }))
  }
})

router.post('/github', (req, res) => {
  if (!githubConfigured()) {
    return res.json({
      configured: false,
      provider: 'github',
      message: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL on the API host.',
    })
  }
  res.json({ configured: true, start: '/api/auth/github' })
})

export default router
