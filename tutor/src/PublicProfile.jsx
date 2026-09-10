import { useState, useEffect } from 'react'
import catalog from '../data/catalog.json'
import { fetchPublicProfile, publicProfileUrl } from './api.js'
import { copyText, setPageMeta, humanizeApiError, slugifyUsername } from './siteUtils.js'
import { CognitiveGraph } from './CognitiveGraph.jsx'

const EMPTY_BIO = 'Engineering learner in the SynapSoul bootcamp — collecting evidence of how they design, debug, and ship.'

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 0 1.77 24h20.46c.98 0 1.77-.78 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z" />
    </svg>
  )
}

function skillColor(id) {
  return catalog.skills.find(s => s.id === id)?.color || '#7c6cf0'
}

function skillProgressFrom(profile) {
  if (profile.skill_progress?.length) return profile.skill_progress
  return catalog.skills.map(skill => {
    const badge = profile.badges?.find(b => b.id === skill.id)
    const completed = badge ? (skill.moduleCount || 1) : 0
    return {
      id: skill.id,
      title: skill.title,
      completed,
      total: skill.moduleCount || 1,
      percent: badge ? 100 : 0,
    }
  })
}

export default function PublicProfile({ username, onBack }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')

  const routeSlug = slugifyUsername(username)
  const profileUrl = publicProfileUrl(profile?.username || routeSlug)

  async function copyLink() {
    setCopyError('')
    if (!profileUrl) {
      setCopyError('This profile link is not valid.')
      return
    }
    const ok = await copyText(profileUrl)
    if (!ok) {
      setCopied(false)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    let cancelled = false
    if (!routeSlug || routeSlug.length < 2) {
      setError('Profile not found')
      setProfile(null)
      return () => { cancelled = true }
    }
    async function load() {
      try {
        const data = await fetchPublicProfile(routeSlug)
        if (!cancelled) setProfile(data)
      } catch (e) {
        if (!cancelled) setError(humanizeApiError(e, 'Profile not found'))
      }
    }
    load()
    return () => { cancelled = true }
  }, [routeSlug])

  useEffect(() => {
    if (error) {
      setPageMeta({
        title: 'Profile not found · SynapSoul',
        description: `No public SynapSoul hiring profile for ${routeSlug || username}.`,
      })
      return
    }
    if (!profile) {
      setPageMeta({ title: `${routeSlug || username} · SynapSoul` })
      return
    }
    setPageMeta({
      title: `${profile.name || profile.username} · SynapSoul`,
      description: profile.headline || profile.bio || `${profile.name || profile.username} on SynapSoul — evidence from built work, not certificates.`,
    })
  }, [error, profile, routeSlug, username])

  if (error) {
    return (
      <div className="public-profile hiring-profile">
        <header className="public-header">
          <button type="button" className="link-btn back-btn" onClick={onBack}>← SynapSoul</button>
        </header>
        <section className="card empty-state">
          <p className="section-eyebrow">Hiring profile</p>
          <h2 className="display-xs">Profile not found</h2>
          <p>No public SynapSoul profile for <code>{routeSlug || username}</code>. Ask the builder to set a username and make the profile public.</p>
          <button type="button" className="btn-secondary" onClick={onBack}>Back to SynapSoul</button>
        </section>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="public-profile hiring-profile">
        <p className="loading-text">Loading hiring profile…</p>
      </div>
    )
  }

  const skills = skillProgressFrom(profile)
  const dimensions = profile.headline_dimensions || []
  const portfolio = profile.portfolio || []
  const badges = profile.badges || []
  const recent = profile.recent_modules || []
  const githubUrl = profile.github_url || (profile.github_username ? `https://github.com/${profile.github_username}` : '')
  const avatar = profile.avatar_url
  const headline = profile.headline && profile.headline !== profile.bio ? profile.headline : ''
  const bio = profile.bio || headline || EMPTY_BIO
  const degreeLine = [profile.degree, profile.college_name].filter(Boolean).join(' · ')
  const metaBits = [
    degreeLine || null,
    profile.location || null,
    profile.track ? `${profile.track} track` : null,
  ].filter(Boolean)
  const displayHandle = profile.username || routeSlug
  const initial = (profile.name || displayHandle || '?')[0].toUpperCase()
  const readiness = Number(profile.readiness_score) || 0

  return (
    <div className="public-profile hiring-profile">
      <header className="public-header">
        <button type="button" className="link-btn back-btn" onClick={onBack}>← SynapSoul</button>
        <div className="public-header-actions">
          {copyError && <span className="field-hint">{copyError}</span>}
          <button type="button" className="btn-secondary copy-link-btn" onClick={copyLink} disabled={!profileUrl}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <span className="public-badge">Hiring profile</span>
        </div>
      </header>

      <section className="card pp-hero">
        <div className="pp-hero-top">
          <div className="pp-identity">
            {avatar ? (
              <img className="pp-avatar" src={avatar} alt="" />
            ) : (
              <div className="pp-avatar pp-avatar-fallback">{initial}</div>
            )}
            <div className="pp-identity-copy">
              <p className="section-eyebrow">SynapSoul builder</p>
              <h1 className="pp-name">{profile.name || displayHandle}</h1>
              {headline && <p className="pp-headline">{headline}</p>}
              <p className="pp-bio">{bio}</p>
              <p className="pp-meta">
                {metaBits.length ? metaBits.join(' · ') : 'SynapSoul bootcamp'}
              </p>
            </div>
          </div>
        </div>

        <div className="pp-socials">
          {githubUrl ? (
            <a className="pp-social-btn" href={githubUrl} target="_blank" rel="noreferrer">
              <GitHubIcon /> GitHub
            </a>
          ) : (
            <span className="pp-social-btn is-empty">GitHub not linked</span>
          )}
          {profile.linkedin_url ? (
            <a className="pp-social-btn" href={profile.linkedin_url} target="_blank" rel="noreferrer">
              <LinkedInIcon /> LinkedIn
            </a>
          ) : (
            <span className="pp-social-btn is-empty">LinkedIn not linked</span>
          )}
          {profile.website ? (
            <a className="pp-social-btn" href={profile.website} target="_blank" rel="noreferrer">Website</a>
          ) : null}
          <button type="button" className="pp-social-btn" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy profile link'}
          </button>
        </div>
      </section>

      <section className="pp-stats" aria-label="Profile stats">
        <div className="pp-stat">
          <span className="pp-stat-value">{profile.modules_completed || 0}</span>
          <span className="pp-stat-label">Modules</span>
        </div>
        <div className="pp-stat">
          <span className="pp-stat-value">{profile.skills_completed || 0}/{profile.skills_total || catalog.skills.length}</span>
          <span className="pp-stat-label">Skills</span>
        </div>
        <div className="pp-stat">
          <span className="pp-stat-value">{profile.evidence_count ?? portfolio.length}</span>
          <span className="pp-stat-label">Evidence</span>
        </div>
        <div className="pp-stat">
          <span className="pp-stat-value">{readiness}</span>
          <span className="pp-stat-label">Readiness / 100</span>
        </div>
      </section>

      <section className="card pp-section cog-public">
        <CognitiveGraph
          compact
          graph={profile.cognitive_graph ? {
            ...profile.cognitive_graph,
            nodes: profile.cognitive_graph.nodes || profile.cognitive_graph.nodes_preview || [],
            edges: profile.cognitive_graph.edges || [],
            hiring: {
              sentences: profile.cognitive_graph.hiring_sentences || [],
              source: profile.cognitive_graph.hiring_source,
            },
          } : {
            claim: 'The tutor does not just track XP. It maps how you reason.',
            nodes: [],
            edges: [],
            fingerprint: { style: 'unscored', summary: 'Decision style fingerprints from DECIDE traces, not from XP.' },
            hiring: {
              sentences: [
                'No DECIDE traces yet — style fingerprints from A/B choices and reasoning length, not from XP.',
                'Priors start at p(know)=0.2. The graph fills from DECIDE, VERIFY, BREAK, and scored modules — never from invented activity.',
                'The frontier is the first Launchpad module: close enough to be reachable, far enough to require a real decision.',
              ],
            },
          }}
        />
      </section>

      <section className="card pp-section">
        <p className="section-eyebrow">Curriculum</p>
        <h2 className="display-xs">Skill <em>progress</em></h2>
        <div className="pp-skill-list">
          {skills.map(skill => (
            <div key={skill.id} className="pp-skill-row">
              <div className="pp-skill-head">
                <span className="pp-skill-title" style={{ '--skill-color': skillColor(skill.id) }}>{skill.title}</span>
                <span className="pp-skill-count">{skill.completed}/{skill.total}</span>
              </div>
              <div className="pp-skill-bar">
                <div
                  className="pp-skill-fill"
                  style={{ width: `${Math.min(skill.percent || 0, 100)}%`, background: skillColor(skill.id) }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card pp-section">
        <p className="section-eyebrow">Proof of work</p>
        <h2 className="display-xs">Built-work <em>evidence</em></h2>
        {portfolio.length ? (
          <div className="pp-evidence-list">
            {portfolio.map((item, i) => (
              <article key={i} className="pp-evidence">
                <h3>{item.artifact || 'Shipped artifact'}</h3>
                <p>{item.student_action || item.proof}</p>
                {item.proof && item.student_action && (
                  <p className="pp-evidence-proof"><strong>Proof · </strong>{item.proof}</p>
                )}
                <div className="pp-evidence-meta">
                  {item.ability && <span className="skill-tag">{item.ability}</span>}
                  {item.confidence && <span className="pp-confidence">{item.confidence}</span>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="pp-empty">
            <p className="pp-empty-title">Building evidence</p>
            <p>
              This builder is in the SynapSoul bootcamp. Scored artifacts — design decisions, debugging writeups,
              and production proof — land here as modules are completed. Nothing is invented for the empty state.
            </p>
          </div>
        )}
      </section>

      <section className="card pp-section">
        <p className="section-eyebrow">Scored reasoning</p>
        <h2 className="display-xs">Readiness <em>dimensions</em></h2>
        {dimensions.length ? (
          <div className="pp-dim-grid">
            {dimensions.map(d => (
              <div key={d.id} className="pp-dim">
                <div className="pp-dim-head">
                  <span>{d.label}</span>
                  <strong>{d.score}<small>/5</small></strong>
                </div>
                <div className="pp-skill-bar">
                  <div className="pp-skill-fill" style={{ width: `${(Number(d.score) / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pp-empty">
            <p className="pp-empty-title">Dimensions after the first scored module</p>
            <p>
              Tradeoff reasoning, debugging, production thinking, and communication scores appear once
              this builder completes a REFLECT evaluation. The profile stays recruiter-readable in the meantime.
            </p>
          </div>
        )}
      </section>

      <section className="card pp-section">
        <p className="section-eyebrow">Credentials</p>
        <h2 className="display-xs">Skill <em>badges</em></h2>
        {badges.length ? (
          <div className="badge-wall">
            {badges.map(b => (
              <span key={b.id} className="skill-badge" style={{ '--skill-color': skillColor(b.id) }}>
                {b.title}
              </span>
            ))}
          </div>
        ) : (
          <div className="pp-empty">
            <p className="pp-empty-title">Badges unlock with completed skills</p>
            <p>Each skill badge means every module in that track was finished and evidenced — not a participation streak.</p>
          </div>
        )}
      </section>

      <section className="card pp-section">
        <p className="section-eyebrow">Activity</p>
        <h2 className="display-xs">Recent <em>modules</em></h2>
        {recent.length ? (
          <ol className="pp-recent">
            {recent.map((m, i) => (
              <li key={`${m.skill_id}-${m.module_id}-${i}`}>
                <span className="pp-recent-title">{m.title}</span>
                <span className="pp-recent-mod">{m.module_label}</span>
                {m.completed_at && (
                  <time dateTime={m.completed_at}>{new Date(m.completed_at).toLocaleDateString()}</time>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div className="pp-empty">
            <p className="pp-empty-title">No modules completed yet</p>
            <p>Recent work will list here in reverse chronological order as this builder ships through the curriculum.</p>
          </div>
        )}
      </section>

      <footer className="public-footer">
        <p>SynapSoul hiring profile · Evidence from built work, not certificates</p>
      </footer>
    </div>
  )
}
