import { useState, useEffect, useRef, useCallback } from 'react'
import catalog from '../data/catalog.json'
import glossary from '../data/glossary.json'
import leaderboardData from '../data/leaderboard.json'
import initialProgress from '../data/progress.json'
import Landing from './Landing.jsx'
import PublicProfile from './PublicProfile.jsx'
import AuthModal from './AuthModal.jsx'
import {
  isLoggedIn, setToken, fetchProgress, fetchLeaderboard, register,
} from './api.js'

function parseRoute() {
  const hash = window.location.hash.slice(1)
  if (hash.startsWith('/u/')) return { type: 'public', username: hash.slice(3) }
  if (hash === '/college') return { type: 'college' }
  return { type: 'app' }
}

const STEPS = ['CONTEXT', 'DECIDE', 'BUILD', 'VERIFY', 'BREAK', 'FIX', 'REFLECT']
const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'skills', label: 'Skills' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'profile', label: 'Profile' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'college', label: 'College' },
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'glossary', label: 'Glossary' },
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
}

function loadProgress() {
  try {
    const saved = localStorage.getItem('ai-tutor-progress-v2')
    if (saved) return JSON.parse(saved)
    const cli = localStorage.getItem('ai-tutor-cli-sync')
    if (cli) return JSON.parse(cli)
    return initialProgress
  } catch {
    return initialProgress
  }
}

function saveProgress(p) {
  localStorage.setItem('ai-tutor-progress-v2', JSON.stringify(p))
}

const FOUNDATION_SKILLS = [
  'system-design-fundamentals',
  'debugging-incidents',
  'decomposition-planning',
  'production-readiness',
  'ai-augmented-engineering',
  'technical-communication',
]

function isBootcampComplete(progress) {
  return FOUNDATION_SKILLS.every(skillId => {
    const skill = catalog.skills.find(s => s.id === skillId)
    const count = Object.keys(progress.completedModules || {}).filter(k => k.startsWith(`${skillId}:`)).length
    return count >= (skill?.moduleCount || 1)
  })
}

function isFoundationComplete(progress) {
  const foundation = catalog.foundationSkill
  const keys = Object.keys(progress.completedModules || {})
  return keys.filter(k => k.startsWith(`${foundation}:`)).length >= 3
}

function skillUnlocked(skill, progress) {
  if (!skill.requiresFoundation) return true
  return isFoundationComplete(progress)
}

function getSkillTitle(skillId) {
  return catalog.skills.find(s => s.id === skillId)?.title || skillId?.replace(/-/g, ' ') || 'Session'
}

function getRecommendedSkill(progress, dimensionScores) {
  const weakest = Object.entries(dimensionScores)
    .filter(([, score]) => score < 4)
    .sort((a, b) => a[1] - b[1])[0]?.[0]
  if (!weakest) return catalog.skills.find(s => s.startHere) || catalog.skills[0]

  const match = catalog.skills.find(skill => {
    const completed = Object.keys(progress.completedModules || {})
      .filter(k => k.startsWith(`${skill.id}:`)).length
    const total = skill.moduleCount || 1
    return skill.growthDimensions?.includes(weakest) && completed < total
  })
  return match || catalog.skills.find(s => s.startHere) || catalog.skills[0]
}

function countSkillModules(progress, skillId) {
  return Object.keys(progress.completedModules || {}).filter(k => k.startsWith(`${skillId}:`)).length
}

function rankClass(index) {
  if (index === 0) return 'gold'
  if (index === 1) return 'silver'
  if (index === 2) return 'bronze'
  return ''
}

function shouldShowLandingOnLoad() {
  const r = parseRoute()
  return r.type === 'app'
}

export default function App() {
  const [route, setRoute] = useState(parseRoute)
  const [showLanding, setShowLanding] = useState(shouldShowLandingOnLoad)
  const [progress, setProgress] = useState(loadProgress)
  const [view, setView] = useState('dashboard')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [glossaryFilter, setGlossaryFilter] = useState('')
  const [toasts, setToasts] = useState([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authUser, setAuthUser] = useState(null)
  const [liveLeaderboard, setLiveLeaderboard] = useState(null)
  const prevCompletedRef = useRef(new Set(Object.keys(loadProgress().completedModules || {})))

  const addToast = useCallback((message, type = 'achievement') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  useEffect(() => { saveProgress(progress) }, [progress])

  useEffect(() => {
    if (showLanding) return
    let cancelled = false

    async function applyProgress(cliProgress) {
      if (cancelled || !cliProgress?.version) return
      const prevKeys = prevCompletedRef.current
      const newKeys = Object.keys(cliProgress.completedModules || {})
        .filter(k => !prevKeys.has(k))
      for (const key of newKeys) {
        const [skillId] = key.split(':')
        addToast(`Module complete — ${getSkillTitle(skillId)}`, 'module')
        const skill = catalog.skills.find(s => s.id === skillId)
        const done = countSkillModules(cliProgress, skillId)
        if (skill && done >= (skill.moduleCount || 1)) {
          addToast(`Skill complete — ${skill.title}!`, 'skill')
        }
      }
      prevCompletedRef.current = new Set(Object.keys(cliProgress.completedModules || {}))
      setProgress(cliProgress)
    }

    async function syncProgress() {
      try {
        if (isLoggedIn()) {
          const cliProgress = await fetchProgress()
          await applyProgress(cliProgress)
          return
        }
        const res = await fetch('/api/progress')
        if (!res.ok || cancelled) return
        await applyProgress(await res.json())
      } catch { /* offline or API unavailable — local-first fallback */ }
    }

    syncProgress()
    const interval = setInterval(syncProgress, 8000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [showLanding, addToast])

  useEffect(() => {
    if (!isLoggedIn()) return
    fetchLeaderboard()
      .then(data => setLiveLeaderboard(data.entries || []))
      .catch(() => {})
  }, [authUser])

  useEffect(() => {
    if (!showLanding && !localStorage.getItem('learnlab-onboarded')) {
      setShowOnboarding(true)
    }
  }, [showLanding])

  useEffect(() => {
    function onHashChange() {
      const r = parseRoute()
      setRoute(r)
      if (r.type === 'public') {
        setShowLanding(false)
      } else if (r.type === 'college') {
        setShowLanding(false)
        setView('college')
      } else {
        setShowLanding(true)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (route.type === 'college') setView('college')
  }, [route])

  function enterApp() {
    setShowLanding(false)
    window.location.hash = ''
    setRoute(parseRoute())
    setView('dashboard')
    if (!localStorage.getItem('learnlab-onboarded')) setShowOnboarding(true)
  }

  async function completeOnboarding(profileData) {
    try {
      if (profileData.email && profileData.password) {
        const { token, user } = await register({
          email: profileData.email,
          password: profileData.password,
          name: profileData.name,
          degree: profileData.degree,
          bio: profileData.bio,
          username: profileData.username,
          college: profileData.college_name || profileData.college,
          track: profileData.track,
        })
        setToken(token)
        setAuthUser(user)
      }
    } catch {
      addToast('Account saved locally — cloud sync unavailable', 'welcome')
    }
    setProgress(p => ({
      ...p,
      profile: { ...p.profile, ...profileData },
    }))
    localStorage.setItem('learnlab-onboarded', '1')
    setShowOnboarding(false)
    addToast('Welcome to LearnLab — paste the universal prompt in Cursor!', 'welcome')
  }

  function handleAuthSuccess({ token, user }) {
    setToken(token)
    setAuthUser(user)
    setShowAuth(false)
    addToast(`Signed in as ${user.name || user.email}`, 'welcome')
    fetchProgress()
      .then(p => setProgress(p))
      .catch(() => {})
  }

  function handleLogout() {
    setToken(null)
    setAuthUser(null)
    addToast('Signed out — progress stays in localStorage', 'welcome')
  }

  function goCollege() {
    setShowLanding(false)
    window.location.hash = '/college'
    setRoute({ type: 'college' })
    setView('college')
  }

  function goPublicProfile(username) {
    setShowLanding(false)
    window.location.hash = `/u/${username}`
    setRoute({ type: 'public', username })
  }

  function goToLanding() {
    setShowLanding(true)
    window.location.hash = ''
    setRoute({ type: 'app' })
  }

  function goHome() {
    goToLanding()
  }

  if (route.type === 'public') {
    return (
      <div className="app public-app">
        <PublicProfile username={route.username} onBack={goHome} />
      </div>
    )
  }

  if (showLanding) {
    return (
      <Landing
        onEnterApp={enterApp}
        onCollege={goCollege}
        onPublicProfile={goPublicProfile}
      />
    )
  }

  const session = progress.session
  const completedCount = Object.keys(progress.completedModules || {}).length
  const totalModules = catalog.skills.reduce((n, s) => n + (s.moduleCount || 3), 0)
  const portfolio = progress.portfolio || []

  const filteredGlossary = glossary.terms.filter(t =>
    !glossaryFilter || t.term.toLowerCase().includes(glossaryFilter.toLowerCase()) ||
    t.definition.toLowerCase().includes(glossaryFilter.toLowerCase())
  )

  const dimensionScores = computeDimensionAverages(progress.scores || {})
  const bootcampComplete = isBootcampComplete(progress)
  const recommendedSkill = getRecommendedSkill(progress, dimensionScores)

  return (
    <div className="app">
      <div className="app-grain" aria-hidden="true" />
      {showOnboarding && (
        <OnboardingWizard
          progress={progress}
          catalog={catalog}
          onComplete={completeOnboarding}
          onDismiss={() => { localStorage.setItem('learnlab-onboarded', '1'); setShowOnboarding(false) }}
        />
      )}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
      <ToastStack toasts={toasts} />
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">LearnLab</span>
            <span className="version">v2</span>
          </div>
          <nav className="nav">
            <button type="button" className="nav-btn" onClick={goToLanding}>
              Home
            </button>
            {NAV.map(n => (
              <button
                key={n.id}
                className={`nav-btn ${view === n.id ? 'active' : ''}`}
                onClick={() => setView(n.id)}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <div className="track-badge">
              Track: <strong>{progress.profile?.track || 'node'}</strong>
            </div>
            {authUser || isLoggedIn() ? (
              <button type="button" className="btn-secondary nav-auth-btn" onClick={handleLogout}>
                Sign out
              </button>
            ) : (
              <button type="button" className="btn-secondary nav-auth-btn" onClick={() => setShowAuth(true)}>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        {bootcampComplete && <CompletionCeremony progress={progress} />}
        {view === 'dashboard' && (
          <DashboardView
            progress={progress}
            session={session}
            completedCount={completedCount}
            totalModules={totalModules}
            portfolioCount={portfolio.length}
            dimensionScores={dimensionScores}
            recommendedSkill={recommendedSkill}
          />
        )}
        {view === 'skills' && (
          <SkillsView
            progress={progress}
            selectedSkill={selectedSkill}
            onSelectSkill={setSelectedSkill}
            skillUnlocked={skillUnlocked}
          />
        )}
        {view === 'portfolio' && <PortfolioView portfolio={portfolio} />}
        {view === 'profile' && <ProfileView progress={progress} catalog={catalog} />}
        {view === 'leaderboard' && (
          <LeaderboardView
            progress={progress}
            demo={liveLeaderboard || leaderboardData}
            onProfile={goPublicProfile}
          />
        )}
        {view === 'college' && <CollegeView demo={leaderboardData} />}
        {view === 'dimensions' && (
          <DimensionsView
            scores={dimensionScores}
            growthAreas={progress.studentMemory?.recurring_growth_areas || []}
          />
        )}
        {view === 'glossary' && (
          <GlossaryView
            terms={filteredGlossary}
            filter={glossaryFilter}
            onFilter={setGlossaryFilter}
          />
        )}
      </main>

      <footer className="footer">
        <p>
          CLI: <code>npm run tutor -- status --all</code> · <code>npm run tutor -- sync --publish</code> · <code>npm run tutor -- start --skill system-design-fundamentals</code>
        </p>
      </footer>
    </div>
  )
}

function DashboardView({ progress, session, completedCount, totalModules, portfolioCount, dimensionScores, recommendedSkill }) {
  const stepIndex = session ? STEPS.indexOf(session.step) : -1
  const topDimensions = Object.entries(dimensionScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const skillTitle = session?.skillId ? getSkillTitle(session.skillId) : null
  const moduleLabel = session?.moduleId?.replace(/-/g, ' ') || ''

  return (
    <>
      <section className="hero dashboard-hero">
        <p className="section-eyebrow">Your bootcamp</p>
        <h1 className="display-sm">Engineering <em>Bootcamp</em></h1>
        <p className="hero-sub">
          Local-first · Multi-track · Adaptive memory · Evidence portfolio
        </p>
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-value">{completedCount}</span>
            <span className="stat-label">Modules done</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{portfolioCount}</span>
            <span className="stat-label">Portfolio items</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{catalog.skills.length}</span>
            <span className="stat-label">Skills</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{catalog.tracks.length}</span>
            <span className="stat-label">Tracks</span>
          </div>
        </div>
        <div className="progress-bar-container">
          <div className="progress-label">
            <span>Overall progress</span>
            <span>{completedCount} / {totalModules}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(completedCount / totalModules) * 100}%` }} />
          </div>
        </div>
      </section>

      {recommendedSkill && (
        <section className="card elevated recommend-card">
          <div className="card-badge">Recommended next</div>
          <h2 className="display-xs">{recommendedSkill.title}</h2>
          <p>{recommendedSkill.description}</p>
          <code className="cli-block">npm run tutor -- start --skill {recommendedSkill.id}</code>
        </section>
      )}

      {topDimensions.length > 0 && (
        <section className="dashboard-dimensions">
          <h2 className="display-xs">Dimension <em>scores</em></h2>
          <div className="dimension-grid compact">
            {topDimensions.map(([dim, score]) => (
              <div key={dim} className="dimension-card">
                <span className="dim-name">{DIMENSION_LABELS[dim] || dim}</span>
                <span className="dim-value">{score}<small>/5</small></span>
                <div className="dim-meter">
                  <div className="dim-meter-fill" style={{ width: `${(score / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {session && (
        <section className="current-session card elevated">
          <div className="card-badge pulse">Active session</div>
          <h2 className="session-title">
            {skillTitle} · {moduleLabel}
          </h2>
          <div className="step-tracker">
            {STEPS.map((step, i) => (
              <div
                key={step}
                className={`step-dot ${i < stepIndex ? 'done' : ''} ${i === stepIndex ? 'active' : ''}`}
              >
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="step-label">{step}</span>
              </div>
            ))}
          </div>
          <p className="cursor-hint">
            In Cursor chat: <code>"Continue my lesson"</code> · Step: <strong>{session.step}</strong>
            {session.hintsUsed > 0 && <span className="hint-penalty"> · {session.hintsUsed} hint(s) used</span>}
          </p>
        </section>
      )}

      {!session && (
        <section className="card start-card elevated">
          <h2 className="display-xs">Ready to <em>start?</em></h2>
          <p>Run in terminal:</p>
          <code className="cli-block">npm run tutor -- start --skill system-design-fundamentals --track node</code>
          <p className="cursor-hint">Or say <code>"Start my lesson"</code> in Cursor chat.</p>
        </section>
      )}

      <section className="features">
        <h2 className="display-xs">Why this beats <em>static tutorials</em></h2>
        <div className="feature-grid">
          {[
            { title: 'Multi-track', desc: 'Node, Python, Go, TypeScript — same concepts, your stack.' },
            { title: 'Adaptive memory', desc: 'Tutor remembers your weak dimensions and learning style.' },
            { title: 'Decision consequences', desc: 'Bugs you fix connect back to choices you made.' },
            { title: 'Evidence portfolio', desc: 'Built work captured as proof, not just scores.' },
            { title: 'Local-first CLI', desc: 'No cloud lock-in. Your progress lives in your repo.' },
            { title: '6 skill tracks', desc: 'System Design, Debugging, Planning, Production, AI, Communication.' },
          ].map(f => (
            <div key={f.title} className="feature-card card elevated">
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function SkillsView({ progress, selectedSkill, onSelectSkill, skillUnlocked }) {
  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Curriculum</p>
        <h2 className="display-sm">Skills</h2>
        <p className="section-sub">Complete <strong>System Design Fundamentals</strong> to unlock all tracks.</p>
      </div>
      <div className="skill-grid">
        {catalog.skills.map((skill, i) => {
          const unlocked = skillUnlocked(skill, progress)
          const completed = Object.keys(progress.completedModules || {})
            .filter(k => k.startsWith(`${skill.id}:`)).length
          return (
            <article
              key={skill.id}
              className={`skill-card work-card ${unlocked ? '' : 'locked'}`}
              style={{ '--skill-color': skill.color, '--delay': `${(i % 4) + 1}` }}
              onClick={() => unlocked && onSelectSkill(skill)}
            >
              <div className="work-card-top">
                <span className="work-tag">{skill.moduleCount || 1} modules</span>
                {!unlocked && <span className="status-badge locked">Locked</span>}
                {unlocked && completed > 0 && (
                  <span className="status-badge done">{completed} done</span>
                )}
                {skill.startHere && <span className="pill start">Start here</span>}
              </div>
              <h3>{skill.title}</h3>
              <p>{skill.description}</p>
              <div className="skill-meta">
                <span>{skill.tracks?.join(' · ') || 'All tracks'}</span>
              </div>
              <div className="work-card-line" style={{ background: skill.color }} />
            </article>
          )
        })}
      </div>

      {selectedSkill && (
        <div className="modal-overlay" onClick={() => onSelectSkill(null)}>
          <div className="modal card elevated" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => onSelectSkill(null)}>×</button>
            <p className="section-eyebrow">Start skill</p>
            <h2 className="display-xs">{selectedSkill.title}</h2>
            <p>{selectedSkill.description}</p>
            <h3>Start command</h3>
            <code className="cli-block">npm run tutor -- start --skill {selectedSkill.id}</code>
            <h3>Growth dimensions</h3>
            <div className="skills">
              {selectedSkill.growthDimensions?.map(d => (
                <span key={d} className="skill-tag">{DIMENSION_LABELS[d] || d}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PortfolioView({ portfolio }) {
  if (!portfolio.length) {
    return (
      <section className="card empty-state elevated">
        <p className="section-eyebrow">Evidence</p>
        <h2 className="display-xs">Portfolio</h2>
        <p>Complete modules and submit evaluations to build your evidence portfolio.</p>
        <p className="cursor-hint">Portfolio items are captured during REFLECT via <code>tutor report</code>.</p>
      </section>
    )
  }
  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Evidence</p>
        <h2 className="display-sm">Portfolio · {portfolio.length} items</h2>
      </div>
      <div className="portfolio-list">
        {portfolio.map((item, i) => (
          <article key={i} className="portfolio-card card elevated">
            <h3>{item.artifact}</h3>
            <p className="portfolio-action">{item.student_action}</p>
            <p className="portfolio-detail"><strong>Technical:</strong> {item.technical_detail}</p>
            <p className="portfolio-proof"><strong>Proof:</strong> {item.proof}</p>
            <div className="portfolio-meta">
              <span className="skill-tag">{item.ability}</span>
              <span className="confidence">{item.confidence}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function DimensionsView({ scores, growthAreas }) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1])
  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Scored reasoning</p>
        <h2 className="display-sm">Skill <em>Dimensions</em></h2>
        <p className="section-sub">Scores from completed module evaluations (1–5 scale).</p>
      </div>
      {entries.length === 0 ? (
        <section className="card empty-state elevated">
          <p>Complete your first module REFLECT to see dimension scores.</p>
        </section>
      ) : (
        <div className="dimension-grid">
          {entries.map(([dim, score]) => (
            <div key={dim} className={`dimension-card ${growthAreas.includes(dim) ? 'focus' : ''}`}>
              <div className="dim-card-head">
                <span className="dim-name">{DIMENSION_LABELS[dim] || dim}</span>
                {growthAreas.includes(dim) && <span className="growth-flag">focus area</span>}
              </div>
              <span className="dim-value">{score}<small>/5</small></span>
              <div className="dim-meter">
                <div className="dim-meter-fill" style={{ width: `${(score / 5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function GlossaryView({ terms, filter, onFilter }) {
  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Reference</p>
        <h2 className="display-sm">Glossary</h2>
      </div>
      <input
        className="glossary-search"
        placeholder="Search terms..."
        value={filter}
        onChange={e => onFilter(e.target.value)}
      />
      <div className="glossary-list">
        {terms.map(t => (
          <article key={t.id} className="glossary-card card elevated">
            <h3>{t.term}</h3>
            <p>{t.definition}</p>
            <p className="glossary-example"><em>Example:</em> {t.example}</p>
            <code className="glossary-ref">tutor ref {t.id}</code>
          </article>
        ))}
      </div>
    </>
  )
}

function computeReadiness(progress) {
  const completed = Object.keys(progress.completedModules || {}).length
  const total = catalog.skills.reduce((n, s) => n + (s.moduleCount || 1), 0)
  const completion = total ? (completed / total) * 40 : 0
  const scores = Object.values(progress.scores || {})
  const avg = scores.length ? scores.reduce((a, s) => a + (s.overall || 0), 0) / scores.length / 5 * 40 : 0
  const port = Math.min((progress.portfolio?.length || 0) * 4, 20)
  return Math.round(completion + avg + port)
}

function ProfileView({ progress, catalog }) {
  const readiness = computeReadiness(progress)
  const completed = Object.keys(progress.completedModules || {}).length
  const profile = progress.profile || {}
  const badges = catalog.skills.filter(s => {
    const count = Object.keys(progress.completedModules || {}).filter(k => k.startsWith(`${s.id}:`)).length
    return count >= (s.moduleCount || 1)
  })

  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Hiring-facing</p>
        <h2 className="display-sm">Public <em>Profile</em></h2>
        <p className="section-sub">Evidence-backed builder profile · Share with recruiters</p>
      </div>

      <section className="profile-hero card elevated">
        <div className="profile-header">
          <div className="profile-identity">
            <div className="profile-avatar">{profile.name?.[0]?.toUpperCase() || '?'}</div>
            <div>
              <h3 className="profile-name">{profile.name || 'Your Name'}</h3>
              <p className="profile-degree">{profile.degree || 'Degree'} · {profile.college_name || 'College'}</p>
              <p className="profile-track">Track: <strong>{profile.track || 'node'}</strong></p>
            </div>
          </div>
          <div className="readiness-ring">
            <span className="readiness-value">{readiness}</span>
            <span className="readiness-label">Readiness</span>
          </div>
        </div>
        <p className="profile-bio">{profile.bio || 'Complete your profile via: tutor profile update'}</p>
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
        <code className="cli-block profile-cli">tutor profile update --name "..." --bio "..." --degree "..."</code>
        {profile.username && (
          <p className="profile-url">
            Public URL: <code>/#/u/{profile.username}</code> · Run <code>tutor sync --publish</code>
          </p>
        )}
        <button
          type="button"
          className="btn-secondary share-profile-btn"
          onClick={() => {
            const url = `${window.location.origin}/#/u/${profile.username || 'your-handle'}`
            navigator.clipboard.writeText(url)
          }}
        >
          Copy profile link
        </button>
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

function CompletionCeremony({ progress }) {
  if (localStorage.getItem('learnlab-ceremony-shown')) return null
  localStorage.setItem('learnlab-ceremony-shown', '1')
  return (
    <section className="card elevated ceremony-card">
      <p className="section-eyebrow">Bootcamp complete</p>
      <h2 className="display-xs">You finished all <em>6 foundation skills</em></h2>
      <p>Publish your hiring-facing profile: <code>tutor sync --publish</code></p>
      <div className="badge-wall">
        {FOUNDATION_SKILLS.map(id => (
          <span key={id} className="skill-badge done">{id.replace(/-/g, ' ')} ✓</span>
        ))}
      </div>
    </section>
  )
}

function CollegeView({ demo }) {
  const avgReadiness = Math.round(demo.reduce((a, s) => a + s.readiness_score, 0) / demo.length)
  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">College analytics</p>
        <h2 className="display-sm">Student <em>insights</em></h2>
        <p className="section-sub">Evidence-based analytics — stub dashboard for college partners</p>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{demo.length}</span>
          <span className="stat-label">Demo students</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{avgReadiness}</span>
          <span className="stat-label">Avg readiness</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">5</span>
          <span className="stat-label">Dimensions tracked</span>
        </div>
      </div>
      <section className="card elevated">
        <h3>Cohort overview</h3>
        <p className="section-sub">Connect GitHub OAuth and cloud sync for live cohort data (future).</p>
        <div className="leaderboard-list">
          {demo.map(e => (
            <div key={e.username} className="leaderboard-row card elevated">
              <div className="lb-info">
                <strong>{e.name}</strong>
                <span className="lb-headline">{e.college_name} · {e.degree}</span>
              </div>
              <span className="lb-score">{e.readiness_score}/100</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function LeaderboardView({ progress, demo, onProfile }) {
  const local = {
    name: progress.profile?.name || 'You',
    readiness_score: computeReadiness(progress),
    modules_completed: Object.keys(progress.completedModules || {}).length,
    headline: 'Your current progress',
  }
  const entries = [local, ...demo].sort((a, b) => b.readiness_score - a.readiness_score)

  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">Rankings</p>
        <h2 className="display-sm">Leaderboard</h2>
        <p className="section-sub">Rankings by readiness score · Refreshes on each visit</p>
      </div>
      <div className="leaderboard-list">
        {entries.map((e, i) => (
          <div
            key={e.username || e.name}
            className={`leaderboard-row card elevated ${e.name === local.name ? 'you' : ''} ${rankClass(i)}`}
          >
            <span className={`rank ${rankClass(i)}`}>
              {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}
            </span>
            <div className="lb-info">
              <strong>
                {e.username && onProfile ? (
                  <button className="link-btn" onClick={() => onProfile(e.username)}>{e.name}</button>
                ) : e.name}
              </strong>
              <span className="lb-headline">{e.headline}</span>
            </div>
            <div className="lb-score-block">
              <span className="lb-score">{e.readiness_score}</span>
              <span className="lb-score-label">/100</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function computeDimensionAverages(scores) {
  const totals = {}
  const counts = {}
  for (const score of Object.values(scores)) {
    for (const [dim, val] of Object.entries(score)) {
      if (typeof val === 'number' && val >= 1 && val <= 5) {
        totals[dim] = (totals[dim] || 0) + val
        counts[dim] = (counts[dim] || 0) + 1
      }
    }
  }
  const avgs = {}
  for (const dim of Object.keys(totals)) {
    avgs[dim] = Math.round((totals[dim] / counts[dim]) * 10) / 10
  }
  return avgs
}

function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'skill' ? '🏆' : t.type === 'module' ? '✓' : '◈'} {t.message}
        </div>
      ))}
    </div>
  )
}

function OnboardingWizard({ progress, catalog, onComplete, onDismiss }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState(progress.profile?.name || '')
  const [degree, setDegree] = useState(progress.profile?.degree || '')
  const [bio, setBio] = useState(progress.profile?.bio || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [college, setCollege] = useState(progress.profile?.college_name || '')
  const [track, setTrack] = useState(progress.profile?.track || 'node')
  const [submitting, setSubmitting] = useState(false)
  const foundation = catalog.skills.find(s => s.startHere) || catalog.skills[0]

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-wizard card elevated">
        <div className="onboarding-steps">
          {[1, 2, 3].map(n => (
            <span key={n} className={`onboarding-dot ${step >= n ? 'active' : ''}`}>{n}</span>
          ))}
        </div>

        {step === 1 && (
          <>
            <p className="section-eyebrow">Step 1 of 3</p>
            <h2 className="display-xs">Your <em>profile</em></h2>
            <p className="section-sub">This unlocks your bootcamp and public hiring profile.</p>
            <label className="onboard-field">
              Name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            </label>
            <label className="onboard-field">
              Degree
              <input value={degree} onChange={e => setDegree(e.target.value)} placeholder="B.Tech CSE" />
            </label>
            <label className="onboard-field">
              Bio
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="What you want to build..." rows={3} />
            </label>
            <label className="onboard-field">
              Email <span className="field-hint">(optional — enables cloud sync)</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@college.edu" />
            </label>
            <label className="onboard-field">
              Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} />
            </label>
            <label className="onboard-field">
              Username
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="your-handle" />
            </label>
            <label className="onboard-field">
              College
              <input value={college} onChange={e => setCollege(e.target.value)} placeholder="Your college name" />
            </label>
            <div className="onboard-actions">
              <button type="button" className="btn-secondary" onClick={onDismiss}>Skip</button>
              <button type="button" className="btn-primary" disabled={!name || !degree || !bio} onClick={() => setStep(2)}>
                Next →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="section-eyebrow">Step 2 of 3</p>
            <h2 className="display-xs">Pick your <em>track</em></h2>
            <p className="section-sub">Same concepts — your preferred runtime.</p>
            <div className="track-picker">
              {catalog.tracks.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`track-option ${track === t.id ? 'selected' : ''}`}
                  onClick={() => setTrack(t.id)}
                >
                  <strong>{t.label}</strong>
                  <span>{t.runtime}</span>
                </button>
              ))}
            </div>
            <div className="onboard-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button type="button" className="btn-primary" onClick={() => setStep(3)}>Next →</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="section-eyebrow">Step 3 of 3</p>
            <h2 className="display-xs">Start your <em>first module</em></h2>
            <p className="section-sub">Run this in terminal, then say &quot;Continue my lesson&quot; in Cursor.</p>
            <code className="cli-block">
              npm run tutor -- start --skill {foundation?.id} --track {track}
            </code>
            <div className="onboard-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button
                type="button"
                className="btn-primary btn-gradient"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true)
                  await onComplete({
                    name, degree, bio, track, email, password,
                    username: username || email.split('@')[0],
                    college_name: college,
                  })
                  setSubmitting(false)
                }}
              >
                {submitting ? 'Setting up…' : 'Finish setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
