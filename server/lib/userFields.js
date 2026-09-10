export const OWNER_COLUMNS = `
  id, email, name, degree, bio, username, college_name, track,
  github_id, github_username, github_avatar, linkedin_url,
  headline, location, website, avatar_url, profile_public, profile_confirmed,
  is_admin, last_seen
`.replace(/\s+/g, ' ').trim()

export function ownerUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    degree: row.degree || '',
    bio: row.bio || '',
    username: row.username || '',
    college_name: row.college_name || '',
    track: row.track || 'node',
    github_id: row.github_id || null,
    github_username: row.github_username || '',
    github_avatar: row.github_avatar || '',
    linkedin_url: row.linkedin_url || '',
    headline: row.headline || '',
    location: row.location || '',
    website: row.website || '',
    avatar_url: row.avatar_url || '',
    profile_public: row.profile_public !== false,
    profile_confirmed: Boolean(row.profile_confirmed),
    is_admin: Boolean(row.is_admin),
    last_seen: row.last_seen || null,
  }
}

export function displayAvatar(user) {
  return user?.avatar_url || user?.github_avatar || ''
}

export function sanitizeHandle(value, fallback) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
  return raw || fallback
}

export function isHttpUrl(value) {
  if (!value) return true
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeLinkedInUrl(value) {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/linkedin\.com/i.test(trimmed)) return `https://${trimmed.replace(/^\/+/, '')}`
  return `https://www.linkedin.com/in/${trimmed.replace(/^@/, '')}`
}

export function githubProfileUrl(username) {
  if (!username) return ''
  return `https://github.com/${encodeURIComponent(String(username).replace(/^@/, ''))}`
}
