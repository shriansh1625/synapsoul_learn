import { useState, useEffect } from 'react'
import {
  isLoggedIn, fetchMe, updateProfile, fetchAuthProviders,
  publicProfileUrl, oauthStartUrl,
} from './api.js'
import { copyText, slugifyUsername, isValidPublicUsername } from './siteUtils.js'
import { notifyProfileUpdate } from './learnerActivity.js'

function computeReadiness(progress, catalog) {
  const completed = Object.keys(progress.completedModules || {}).length
  const total = catalog.skills.reduce((n, s) => n + (s.moduleCount || 1), 0)
  const completion = total ? (completed / total) * 40 : 0
  const scores = Object.values(progress.scores || {})
  const avg = scores.length ? scores.reduce((a, s) => a + (s.overall || 0), 0) / scores.length / 5 * 40 : 0
  const port = Math.min((progress.portfolio?.length || 0) * 4, 20)
  return Math.round(completion + avg + port)
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function formFrom(profile = {}, cloud = null) {
  const src = { ...profile, ...cloud }
  return {
    name: src.name || '',
    headline: src.headline || '',
    bio: src.bio || '',
    degree: src.degree || '',
    college_name: src.college_name || src.college || '',
    username: src.username || '',
    location: src.location || '',
    website: src.website || '',
    linkedin_url: src.linkedin_url || '',
    github_username: src.github_username || '',
  }
}

export default function ProfileView({
  progress,
  catalog,
  authUser,
  onSaveLocal,
  onAuthUser,
  onNeedAuth,
  onOpenPublic,
  addToast,
}) {
  const profile = progress.profile || {}
  const [form, setForm] = useState(() => formFrom(profile, authUser))
  const [cloud, setCloud] = useState(authUser)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [providers, setProviders] = useState({ github: false, linkedin: false })
  const [error, setError] = useState('')

  const loggedIn = isLoggedIn()
  const readiness = computeReadiness(progress, catalog)
  const completed = Object.keys(progress.completedModules || {}).length
  const badges = catalog.skills.filter(s => {
    const count = Object.keys(progress.completedModules || {}).filter(k => k.startsWith(`${s.id}:`)).length
    return count >= (s.moduleCount || 1)
  })
  /** Public links must match GET /api/profile/:slug — only the saved server username counts. */
  const savedHandle = slugifyUsername(loggedIn ? (cloud?.username || '') : (cloud?.username || profile.username || ''))
  const draftHandle = slugifyUsername(form.username)
  const handle = isValidPublicUsername(savedHandle) ? savedHandle : null
  const publicUrl = handle ? publicProfileUrl(handle) : null
  const usernamePending = loggedIn && isValidPublicUsername(draftHandle) && draftHandle !== savedHandle
  const avatar = cloud?.avatar_url || cloud?.github_avatar || profile.avatar_url
  const githubConnected = Boolean(cloud?.github_id || cloud?.github_username)

  useEffect(() => {
    fetchAuthProviders().then(setProviders).catch(() => setProviders({ github: false, linkedin: false }))
  }, [])

  useEffect(() => {
    if (!loggedIn) {
      setForm(formFrom(profile, null))
      return
    }
    let cancelled = false
    fetchMe()
      .then(user => {
        if (cancelled || !user) return
        setCloud(user)
        onAuthUser?.(user)
        setForm(formFrom(profile, user))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [loggedIn])

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const username = slugifyUsername(form.username)
    if (!isValidPublicUsername(username)) {
      setError('Username must be 2–32 letters, numbers, hyphens, or underscores.')
      addToast?.('Choose a public username (e.g. shriansh-singh), then click Save public profile.', 'error')
      return
    }
    const partial = {
      name: form.name,
      headline: form.headline,
      bio: form.bio,
      degree: form.degree,
      college_name: form.college_name,
      username,
      location: form.location,
      website: form.website,
      linkedin_url: form.linkedin_url,
      github_username: form.github_username,
    }
    if (!loggedIn) {
      onSaveLocal(partial)
      setForm(f => ({ ...f, ...partial }))
      addToast?.('Saved on this device. Sign in to publish your hiring profile.', 'success')
      onNeedAuth?.()
      return
    }
    setSaving(true)
    try {
      const { user } = await updateProfile({
        ...partial,
        college: form.college_name,
        profile_public: true,
      })
      setCloud(user)
      onAuthUser?.(user)
      onSaveLocal(user)
      setForm(f => formFrom({ ...f, ...user }, user))
      notifyProfileUpdate({ profile: user })
      addToast?.('Hiring profile saved — your public link is live', 'success')
    } catch (err) {
      setError(err.message || 'Could not save your profile. Try again.')
      addToast?.('Could not save your profile. Try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    if (!publicUrl) {
      addToast?.('Set a username in the profile editor below, save, then copy your link.', 'error')
      return
    }
    const ok = await copyText(publicUrl)
    if (!ok) {
      addToast?.('Could not copy the link. Copy it from the address bar.', 'error')
      return
    }
    setCopied(true)
    addToast?.('Profile link copied', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  function startOAuth(provider) {
    if (!providers[provider]) return
    if (!loggedIn) {
      onNeedAuth?.()
      return
    }
    window.location.href = oauthStartUrl(provider, { connect: true })
  }

  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Hiring-facing</p>
        <h2 className="display-sm">Public <em>Profile</em></h2>
        <p className="section-sub">Edit in-app. Recruiters see the public page — not this editor.</p>
      </div>

      <section className="profile-hero card elevated">
        <div className="profile-header">
          <div className="profile-identity">
            {avatar ? (
              <img className="profile-avatar" src={avatar} alt="" />
            ) : (
              <div className="profile-avatar">{(form.name || 'Y')[0].toUpperCase()}</div>
            )}
            <div>
              <h3 className={`profile-name ${form.name ? '' : 'is-empty'}`}>{form.name || 'Complete your profile'}</h3>
              <p className="profile-degree">
                {[form.degree, form.college_name].filter(Boolean).join(' · ') || 'Add degree and college'}
              </p>
              <p className="profile-track">Track: <strong>{profile.track || 'node'}</strong></p>
            </div>
          </div>
          <div className="readiness-ring">
            <span className="readiness-value">{readiness}</span>
            <span className="readiness-label">Readiness</span>
          </div>
        </div>
        <p className="profile-bio">
          {form.headline || form.bio || 'Write a headline and bio so recruiters know what you are building.'}
        </p>
        <div className="profile-stats-row">
          <div className="profile-stat">
            <span className="profile-stat-value">{completed}</span>
            <span className="profile-stat-label">Modules</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{badges.length}/{catalog.skills.length}</span>
            <span className="profile-stat-label">Skills</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-value">{progress.portfolio?.length || 0}</span>
            <span className="profile-stat-label">Evidence</span>
          </div>
        </div>
        {publicUrl && (
          <p className="profile-url">
            Public URL: <code>{publicUrl}</code>
          </p>
        )}
        {usernamePending && (
          <p className="field-hint profile-setup-hint">
            You typed <code>/u/{draftHandle}</code> but it is not live yet — click <strong>Save public profile</strong> to publish that username.
          </p>
        )}
        {loggedIn && !publicUrl && isValidPublicUsername(draftHandle) && (
          <p className="field-hint profile-setup-hint">
            Save your profile to activate <code>/u/{draftHandle}</code>.
          </p>
        )}
        <div className="profile-preview-actions">
          <button type="button" className="btn-secondary share-profile-btn" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy profile link'}
          </button>
          {publicUrl && (
            <button type="button" className="btn-secondary" onClick={() => onOpenPublic?.(handle)}>
              View public page
            </button>
          )}
        </div>
      </section>

      <section className="card elevated profile-editor">
        <p className="section-eyebrow">Owner editor</p>
        <h3 className="display-xs">Edit your <em>hiring profile</em></h3>
        <p className="section-sub">
          {loggedIn
            ? 'Recruiters see your page only after you click Save public profile. GitHub and LinkedIn are optional.'
            : 'Sign in to publish. Until then, edits stay on this device.'}
        </p>

        <div className="profile-connect-row">
          <button
            type="button"
            className="btn-secondary oauth-connect-btn"
            disabled={!providers.github}
            onClick={() => startOAuth('github')}
            title={providers.github ? '' : 'Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the API host'}
          >
            <GitHubIcon />
            {githubConnected ? 'GitHub connected' : providers.github ? 'Connect GitHub' : 'GitHub setup required'}
          </button>
          <button
            type="button"
            className="btn-secondary oauth-connect-btn"
            disabled={!providers.linkedin}
            onClick={() => startOAuth('linkedin')}
            title={providers.linkedin ? '' : 'Paste a LinkedIn URL below, or set LINKEDIN_CLIENT_ID on the API host'}
          >
            {providers.linkedin ? 'Connect LinkedIn' : 'LinkedIn OAuth not configured'}
          </button>
        </div>
        {!providers.github && (
          <p className="field-hint profile-setup-hint">
            GitHub sign-in is waiting on API env vars — the button stays visible instead of failing. You can still paste a GitHub username.
          </p>
        )}

        <form onSubmit={handleSave} className="profile-form">
          <div className="profile-form-grid">
            <label className="onboard-field">
              Name
              <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Full name" />
            </label>
            <label className="onboard-field">
              Username
              <input
                value={form.username}
                onChange={e => setField('username', e.target.value)}
                onBlur={() => {
                  const slug = slugifyUsername(form.username)
                  if (slug && slug !== form.username) setField('username', slug)
                }}
                placeholder="shriansh-singh"
              />
            </label>
            <label className="onboard-field profile-form-span">
              Headline
              <input value={form.headline} onChange={e => setField('headline', e.target.value)} placeholder="Backend engineer focused on production systems" />
            </label>
            <label className="onboard-field profile-form-span">
              Bio
              <textarea value={form.bio} onChange={e => setField('bio', e.target.value)} placeholder="What you build, how you think, what you want next." rows={4} />
            </label>
            <label className="onboard-field">
              Degree
              <input value={form.degree} onChange={e => setField('degree', e.target.value)} placeholder="B.Tech CSE" />
            </label>
            <label className="onboard-field">
              College
              <input value={form.college_name} onChange={e => setField('college_name', e.target.value)} placeholder="Your college" />
            </label>
            <label className="onboard-field">
              Location
              <input value={form.location} onChange={e => setField('location', e.target.value)} placeholder="Bengaluru, India" />
            </label>
            <label className="onboard-field">
              Website
              <input value={form.website} onChange={e => setField('website', e.target.value)} placeholder="https://" />
            </label>
            <label className="onboard-field">
              LinkedIn URL
              <input value={form.linkedin_url} onChange={e => setField('linkedin_url', e.target.value)} placeholder="https://www.linkedin.com/in/you" />
            </label>
            <label className="onboard-field">
              GitHub username
              <input value={form.github_username} onChange={e => setField('github_username', e.target.value)} placeholder="your-github" />
            </label>
          </div>
          {error && <p className="auth-error">{error}</p>}
          <div className="onboard-actions profile-form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : loggedIn ? 'Save public profile' : 'Save and sign in to publish'}
            </button>
          </div>
        </form>
      </section>

      {progress.portfolio?.length > 0 && (
        <section className="card elevated profile-evidence">
          <h3 className="display-xs">Built-work <em>evidence</em></h3>
          {progress.portfolio.slice(0, 3).map((item, i) => (
            <blockquote key={i} className="evidence-quote">
              "{item.proof || item.student_action}"
              <cite>— {item.artifact}</cite>
            </blockquote>
          ))}
        </section>
      )}

      {progress.portfolio?.length === 0 && (
        <section className="card elevated">
          <h3 className="display-xs">Building <em>evidence</em></h3>
          <p className="section-sub">
            Your public page already has a complete evidence section. Artifacts from scored modules will fill it —
            recruiters will not see a blank score card or a CLI command.
          </p>
        </section>
      )}

      {badges.length > 0 && (
        <section className="card elevated">
          <h3 className="display-xs">Skill <em>badges</em></h3>
          <div className="badge-wall">
            {badges.map(b => (
              <span key={b.id} className="skill-badge" style={{ '--skill-color': b.color }}>
                {b.title} ✓
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
