import { useState, useEffect } from 'react'
import { fetchPublicProfile } from './api.js'

export default function PublicProfile({ username, onBack }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const profileUrl = `${window.location.origin}/#/u/${username}`

  function copyLink() {
    navigator.clipboard.writeText(profileUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await fetchPublicProfile(username)
        if (!cancelled) setProfile(data)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Profile not found')
      }
    }
    load()
    return () => { cancelled = true }
  }, [username])

  if (error) {
    return (
      <div className="public-profile">
        <button className="link-btn back-btn" onClick={onBack}>← Back</button>
        <section className="card empty-state">
          <h2>Profile not found</h2>
          <p>No public profile for <code>{username}</code>. Run <code>tutor sync --publish</code> after setting a username.</p>
        </section>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="public-profile">
        <p className="loading-text">Loading profile…</p>
      </div>
    )
  }

  return (
    <div className="public-profile">
      <header className="public-header">
        <button className="link-btn back-btn" onClick={onBack}>← LearnLab</button>
        <div className="public-header-actions">
          <button type="button" className="btn-secondary copy-link-btn" onClick={copyLink}>
            {copied ? 'Link copied!' : 'Copy link'}
          </button>
          <span className="public-badge">Built-work profile</span>
        </div>
      </header>

      <section className="profile-hero card">
        <h1>{profile.name}</h1>
        <p className="profile-degree">{profile.degree}{profile.college_name ? ` · ${profile.college_name}` : ''}</p>
        <p className="profile-bio">{profile.bio || profile.headline}</p>
        <div className="readiness-ring">
          <span className="readiness-value">{profile.readiness_score}</span>
          <span className="readiness-label">Readiness / 100</span>
        </div>
        <p className="profile-stats">
          {profile.modules_completed} modules · {profile.skills_completed} skills complete
        </p>
      </section>

      {profile.headline_dimensions?.length > 0 && (
        <section className="card">
          <h2>Dimension scores</h2>
          <div className="headline-dimensions">
            {profile.headline_dimensions.map(d => (
              <div key={d.id} className="dim-card">
                <span className="dim-card-label">{d.label}</span>
                <span className="dim-card-score">{d.score ?? '—'}/5</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {profile.portfolio?.length > 0 && (
        <section className="card">
          <h2>Built-work evidence</h2>
          {profile.portfolio.map((item, i) => (
            <blockquote key={i} className="evidence-quote">
              "{item.proof || item.student_action}"
              <cite>— {item.artifact}</cite>
            </blockquote>
          ))}
        </section>
      )}

      {profile.badges?.length > 0 && (
        <section className="card">
          <h2>Skill badges</h2>
          <div className="skills">
            {profile.badges.map(b => (
              <span key={b.id} className="skill-tag done">{b.title} ✓</span>
            ))}
          </div>
        </section>
      )}

      <footer className="public-footer">
        <p>Hiring-facing profile · Evidence-backed engineering bootcamp</p>
      </footer>
    </div>
  )
}
