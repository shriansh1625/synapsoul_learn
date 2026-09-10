import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

export function frontendOrigin() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '')
}

export function frontendRedirect(params) {
  const query = new URLSearchParams(params)
  return `${frontendOrigin()}/#/auth/callback?${query.toString()}`
}

export function publicApiOrigin(req) {
  const configured = (process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '')
  if (configured) return configured
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https'
  const host = req.headers['x-forwarded-host'] || req.get?.('host')
  if (host) return `${proto}://${host}`
  return 'http://localhost:3001'
}

export function wantsJson(req) {
  const accept = String(req.headers.accept || '')
  return req.query.json === '1' || req.query.format === 'json' || (accept.includes('application/json') && !accept.includes('text/html'))
}

export function githubConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
}

export function linkedinConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

export function githubCallbackUrl(req) {
  return (process.env.GITHUB_CALLBACK_URL || `${publicApiOrigin(req)}/api/auth/github/callback`).replace(/\/$/, '')
}

export function linkedinCallbackUrl(req) {
  return (process.env.LINKEDIN_CALLBACK_URL || `${publicApiOrigin(req)}/api/auth/linkedin/callback`).replace(/\/$/, '')
}

export function signOAuthState(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' })
}

export function readOAuthState(state) {
  if (!state) return { mode: 'login' }
  try {
    return jwt.verify(state, JWT_SECRET)
  } catch {
    return { mode: 'login', invalid: true }
  }
}

export function githubAuthorizeUrl(req, state) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: githubCallbackUrl(req),
    scope: 'read:user user:email',
    state,
    allow_signup: 'true',
  })
  return `https://github.com/login/oauth/authorize?${params}`
}

export function linkedinAuthorizeUrl(req, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: linkedinCallbackUrl(req),
    scope: 'openid profile email',
    state,
  })
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`
}

export async function exchangeGithubCode(req, code) {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: githubCallbackUrl(req),
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'GitHub token exchange failed')
  }

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${tokenData.access_token}`,
    'User-Agent': 'SynapSoul',
  }
  const [userRes, emailRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers: ghHeaders }),
    fetch('https://api.github.com/user/emails', { headers: ghHeaders }),
  ])
  const ghUser = await userRes.json()
  if (!ghUser?.id) throw new Error('Could not load GitHub profile')

  let email = ghUser.email || ''
  if (emailRes.ok) {
    const emails = await emailRes.json()
    if (Array.isArray(emails)) {
      const primary = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0]
      if (primary?.email) email = primary.email
    }
  }
  if (!email) email = `${ghUser.id}+${ghUser.login}@users.noreply.github.com`

  return {
    github_id: String(ghUser.id),
    github_username: ghUser.login,
    github_avatar: ghUser.avatar_url || '',
    name: ghUser.name || ghUser.login,
    bio: ghUser.bio || '',
    location: ghUser.location || '',
    website: ghUser.blog || '',
    email,
  }
}

export async function exchangeLinkedInCode(req, code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: linkedinCallbackUrl(req),
    client_id: process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  })
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'LinkedIn token exchange failed')
  }

  const infoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const info = await infoRes.json()
  if (!info?.sub) throw new Error('Could not load LinkedIn profile')

  return {
    linkedin_id: String(info.sub),
    name: info.name || [info.given_name, info.family_name].filter(Boolean).join(' '),
    email: info.email || '',
    avatar_url: info.picture || '',
    linkedin_url: info.profile || '',
  }
}
