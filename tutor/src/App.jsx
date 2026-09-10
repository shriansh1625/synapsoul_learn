import { useState, useEffect, useRef, useCallback } from 'react'
import catalog from '../data/catalog.json'
import glossary from '../data/glossary.json'
import leaderboardData from '../data/leaderboard.json'
import initialProgress from '../data/progress.json'
import Landing from './Landing.jsx'
import PublicProfile from './PublicProfile.jsx'
import ProfileView from './ProfileView.jsx'
import AuthModal from './AuthModal.jsx'
import AdminGate from './AdminDashboard.jsx'
import { BrainPanel } from './BrainPanel.jsx'
import { useBrain } from './brain/useBrain.js'
import {
  isLoggedIn, setToken, fetchProgress, fetchLeaderboard, register, canSyncProgress,
  fetchLlmHint, apiEnabled, fetchMe, logoutAdminOtp,
} from './api.js'
import { loadModuleJson } from './curriculumModules.js'
import { copyText, setPageMeta, UNIVERSAL_PROMPT, humanizeApiError, slugifyUsername, isValidPublicUsername, storageGet, storageSet } from './siteUtils.js'

const ONBOARDED_KEYS = ['synapsoul-onboarded', 'learnlab-onboarded']
const CEREMONY_KEYS = ['synapsoul-ceremony-shown', 'learnlab-ceremony-shown']

function publicRouteUsername(raw) {
  try {
    return slugifyUsername(decodeURIComponent(String(raw || '')))
  } catch {
    return slugifyUsername(raw)
  }
}

function pathEquals(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase()
}

function pathStartsWith(a, prefix) {
  return String(a || '').toLowerCase().startsWith(String(prefix).toLowerCase())
}

function parseRoute() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  const search = new URLSearchParams(window.location.search)
  const hashRaw = window.location.hash.slice(1)
  const [hashPathOnly, hashQuery] = hashRaw.split('?')
  const hashPath = hashPathOnly || ''
  const hashSearch = new URLSearchParams(hashQuery || '')

  const token = search.get('token') || hashSearch.get('token')
  const github = search.get('github') || hashSearch.get('github')
  const linkedin = search.get('linkedin') || hashSearch.get('linkedin')
  const error = search.get('error') || hashSearch.get('error')
  const provider = search.get('provider') || hashSearch.get('provider')
  const connected = search.get('connected') || hashSearch.get('connected')
  const cli = search.get('cli') || hashSearch.get('cli')
  const nonce = search.get('nonce') || hashSearch.get('nonce')

  const pathUser = path.match(/^\/u\/([^/]+)$/i)
  if (pathUser) return { type: 'public', username: publicRouteUsername(pathUser[1]) }
  const hashUser = hashPath.match(/^\/u\/(.+)$/i)
  if (hashUser) return { type: 'public', username: publicRouteUsername(hashUser[1]) }

  if (
    pathEquals(path, '/auth/callback') ||
    pathEquals(hashPath, '/auth/callback') ||
    pathEquals(hashPath, '/auth') ||
    token || github === 'setup' || linkedin === 'setup' || error
  ) {
    return { type: 'oauth', token, github, linkedin, error, provider, connected, cli, nonce }
  }

  if (pathEquals(hashPath, '/college') || pathEquals(path, '/college')) return { type: 'college' }
  if (pathEquals(hashPath, '/admin') || pathEquals(path, '/admin')) return { type: 'admin' }

  const knownHash = !hashPath || pathEquals(hashPath, '/') || !hashPath.startsWith('/')
  const knownPath = pathEquals(path, '/') || pathEquals(path, '/index.html')
  if (!knownPath) return { type: 'notfound', path }
  if (
    !knownHash
    && !pathEquals(hashPath, '/college')
    && !pathEquals(hashPath, '/admin')
    && !pathStartsWith(hashPath, '/u/')
    && !pathEquals(hashPath, '/auth')
    && !pathEquals(hashPath, '/auth/callback')
  ) {
    return { type: 'notfound', path: hashPath }
  }
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
  const [navOpen, setNavOpen] = useState(false)
  const prevCompletedRef = useRef(new Set(Object.keys(loadProgress().completedModules || {})))
  const syncFailuresRef = useRef(0)
  const { snapshot: brainSnapshot, observe: observeBrainEvent } = useBrain(progress, authUser)

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
      if (!canSyncProgress()) return
      if (syncFailuresRef.current >= 3) return
      try {
        const cliProgress = await fetchProgress()
        if (cancelled) return
        syncFailuresRef.current = 0
        await applyProgress(cliProgress)
      } catch {
        syncFailuresRef.current += 1
        if (syncFailuresRef.current === 1) {
          addToast('Could not sync progress from the cloud. Work on this device is still saved.', 'error')
        }
      }
    }

    syncProgress()
    const interval = setInterval(syncProgress, 8000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [showLanding, addToast, authUser])

  useEffect(() => {
    if (!isLoggedIn()) return
    fetchLeaderboard()
      .then(data => setLiveLeaderboard(data.entries || []))
      .catch(() => {})
  }, [authUser])

  useEffect(() => {
    if (!isLoggedIn() || authUser) return
    fetchMe()
      .then(user => {
        if (!user) return
        setAuthUser(user)
        setProgress(p => ({ ...p, profile: { ...p.profile, ...user } }))
      })
      .catch(() => {})
  }, [authUser])

  useEffect(() => {
    if (!showLanding && !storageGet(...ONBOARDED_KEYS)) {
      setShowOnboarding(true)
    }
  }, [showLanding])

  useEffect(() => {
    function onRouteChange() {
      const r = parseRoute()
      setRoute(r)
      if (r.type === 'public' || r.type === 'oauth') {
        setShowLanding(false)
      } else if (r.type === 'college') {
        setShowLanding(false)
        setView('college')
      } else if (r.type === 'notfound' || r.type === 'admin') {
        setShowLanding(false)
      }
      setNavOpen(false)
    }
    window.addEventListener('hashchange', onRouteChange)
    window.addEventListener('popstate', onRouteChange)
    return () => {
      window.removeEventListener('hashchange', onRouteChange)
      window.removeEventListener('popstate', onRouteChange)
    }
  }, [])

  useEffect(() => {
    if (route.type === 'college') setView('college')
  }, [route])

  useEffect(() => {
    if (showLanding || route.type === 'public' || route.type === 'oauth') return
    if (route.type === 'notfound' || route.type === 'admin') {
      setPageMeta({
        title: 'Page not found · SynapSoul',
        description: 'That SynapSoul Learn Hub page does not exist. Head back to the bootcamp home.',
      })
      return
    }
    const titles = {
      dashboard: ['Dashboard · SynapSoul', 'Your SynapSoul Learn Hub bootcamp progress, evidence, and next module.'],
      skills: ['Skills · SynapSoul', 'Six engineering skills — system design, debugging, production, AI, and communication.'],
      portfolio: ['Portfolio · SynapSoul', 'Evidence of how you design, debug, and ship — not certificates.'],
      profile: ['Profile · SynapSoul', 'Edit your recruiter-facing SynapSoul hiring profile.'],
      leaderboard: ['Leaderboard · SynapSoul', 'Readiness rankings across the SynapSoul Learn Hub bootcamp.'],
      college: ['College · SynapSoul', 'Cohort insights for college partners.'],
      dimensions: ['Dimensions · SynapSoul', 'Scored reasoning across SynapSoul evidence dimensions.'],
      glossary: ['Glossary · SynapSoul', 'Engineering terms used across the SynapSoul curriculum.'],
    }
    const pair = titles[view] || titles.dashboard
    setPageMeta({ title: pair[0], description: pair[1] })
  }, [showLanding, route, view])

  function enterApp() {
    setShowLanding(false)
    window.location.hash = ''
    setRoute(parseRoute())
    setView('dashboard')
    if (!storageGet(...ONBOARDED_KEYS)) setShowOnboarding(true)
  }

  function saveProfilePartial(partial) {
    setProgress(p => ({ ...p, profile: { ...p.profile, ...partial } }))
  }

  async function tryRegisterOnboarding(data) {
    if (!data.email || !data.password) return
    try {
      const { token, user } = await register({
        email: data.email,
        password: data.password,
        name: data.name,
        degree: data.degree,
        bio: data.bio,
        username: data.username,
        college: data.college_name || data.college,
        track: data.track,
      })
      setToken(token)
      setAuthUser(user)
      syncFailuresRef.current = 0
      addToast('Account created — you can sign in on any device', 'success')
    } catch {
      addToast('Account saved on this device — cloud sync unavailable', 'error')
    }
  }

  async function completeOnboarding(profileData) {
    setProgress(p => ({
      ...p,
      profile: { ...p.profile, ...profileData },
    }))
    observeBrainEvent({
      type: 'onboarding',
      payload: { track: profileData.track, level: profileData.level || progress.profile?.level || 'beginner' },
    })
    storageSet('1', ...ONBOARDED_KEYS)
    setShowOnboarding(false)
    addToast('Welcome to SynapSoul — paste the universal prompt in Cursor', 'success')
  }

  function handleAuthSuccess({ token, user }) {
    setToken(token)
    setAuthUser(user)
    setShowAuth(false)
    setShowLanding(false)
    if (user) {
      setProgress(p => ({ ...p, profile: { ...p.profile, ...user } }))
    }
    addToast(`Signed in as ${user?.name || user?.email || 'SynapSoul'}`, 'success')
    fetchProgress()
      .then(p => setProgress(p))
      .catch(() => {})
  }

  async function handleLogout() {
    try {
      await logoutAdminOtp()
    } catch {
      /* local session still clears */
    }
    setToken(null)
    setAuthUser(null)
    addToast('Signed out — progress stays on this device', 'success')
  }

  function goCollege() {
    setShowLanding(false)
    window.location.hash = '/college'
    setRoute({ type: 'college' })
    setView('college')
  }

  function goPublicProfile(username) {
    const slug = slugifyUsername(username)
    if (!isValidPublicUsername(slug)) return
    setShowLanding(false)
    const path = `/u/${encodeURIComponent(slug)}`
    window.history.pushState({}, '', path)
    setRoute({ type: 'public', username: slug })
  }

  function goToLanding() {
    setShowLanding(true)
    window.history.pushState({}, '', '/')
    window.location.hash = ''
    setRoute({ type: 'app' })
  }

  function goHome() {
    goToLanding()
  }

  if (route.type === 'oauth') {
    return (
      <div className="app public-app">
        <OAuthCatch
          route={route}
          onSuccess={result => {
            handleAuthSuccess(result)
            if (route.cli === '1') return
            setView('profile')
            setRoute({ type: 'app' })
          }}
          onSetup={r => {
            setShowLanding(false)
            setShowAuth(true)
            setRoute({ type: 'app' })
            addToast(
              r.github === 'setup'
                ? 'GitHub OAuth is not configured on the API host yet'
                : 'LinkedIn OAuth is not configured — paste a LinkedIn URL on your profile',
              'welcome'
            )
          }}
          onError={message => {
            setShowLanding(false)
            setShowAuth(true)
            setRoute({ type: 'app' })
            addToast(message, 'welcome')
          }}
        />
      </div>
    )
  }

  if (route.type === 'public') {
    return (
      <div className="app public-app">
        <PublicProfile username={route.username} onBack={goHome} />
      </div>
    )
  }

  if (route.type === 'notfound') {
    return (
      <div className="app public-app">
        <NotFoundView onHome={goHome} path={route.path} />
      </div>
    )
  }

  if (route.type === 'admin') {
    return (
      <div className="app public-app">
        <AdminGate onHome={goHome} />
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
  const recommendedSkill = brainSnapshot?.recommendedNext
    ? catalog.skills.find(s => s.id === brainSnapshot.recommendedNext.skillId) || getRecommendedSkill(progress, dimensionScores)
    : getRecommendedSkill(progress, dimensionScores)

  return (
    <div className="app">
      <div className="app-grain" aria-hidden="true" />
      {showOnboarding && (
        <OnboardingWizard
          progress={progress}
          catalog={catalog}
          onSaveProfile={saveProfilePartial}
          onTryRegister={tryRegisterOnboarding}
          onComplete={completeOnboarding}
          onDismiss={() => { storageSet('1', ...ONBOARDED_KEYS); setShowOnboarding(false) }}
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
            <img className="logo-mark" src="/brand/synapsoul-mark.png" alt="SynapSoul" width="32" height="32" />
            <span className="logo-text">SynapSoul</span>
            <span className="version">v2</span>
          </div>
          <button
            type="button"
            className="nav-burger app-burger"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            aria-controls="app-menu"
            onClick={() => setNavOpen(open => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          <nav id="app-menu" className={`nav ${navOpen ? 'is-open' : ''}`}>
            <button type="button" className="nav-btn" onClick={() => { setNavOpen(false); goToLanding() }}>
              Home
            </button>
            {NAV.map(n => (
              <button
                key={n.id}
                className={`nav-btn ${view === n.id ? 'active' : ''}`}
                onClick={() => { setNavOpen(false); setView(n.id) }}
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
            brainSnapshot={brainSnapshot}
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
        {view === 'profile' && (
          <ProfileView
            progress={progress}
            catalog={catalog}
            authUser={authUser}
            onSaveLocal={saveProfilePartial}
            onAuthUser={setAuthUser}
            onNeedAuth={() => setShowAuth(true)}
            onOpenPublic={goPublicProfile}
            addToast={addToast}
          />
        )}
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
          SynapSoul ·{' '}
          <button type="button" className="link-btn" onClick={goToLanding}>Home</button>
          {' · '}
          <a className="link-btn" href="/skill.md">Instructor protocol</a>
        </p>
      </footer>
    </div>
  )
}

function DashboardView({ progress, session, completedCount, totalModules, portfolioCount, dimensionScores, recommendedSkill, brainSnapshot }) {
  const stepIndex = session ? STEPS.indexOf(session.step) : -1
  const topDimensions = Object.entries(dimensionScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const skillTitle = session?.skillId ? getSkillTitle(session.skillId) : null
  const moduleLabel = session?.moduleId?.replace(/-/g, ' ') || ''
  const rec = brainSnapshot?.recommendedNext
  const profile = progress?.profile
  const [hintState, setHintState] = useState(null)
  const [hintLoading, setHintLoading] = useState(false)
  const loggedIn = isLoggedIn()
  const hasCli = Boolean(progress?.has_cli)
  const sessionKind = progress?.session_kind || (session ? (hasCli ? 'cli_sync' : (loggedIn ? 'website' : 'local')) : 'none')
  const sessionBadge = !loggedIn
    ? 'Local demo — not IDE CLI'
    : hasCli
      ? 'Cloud snapshot (last CLI sync)'
      : 'Website session — not IDE CLI'

  const requestHint = useCallback(async () => {
    if (!session) return
    setHintLoading(true)
    try {
      const moduleJson = await loadModuleJson(session.skillId, session.moduleId)
      const stepContent = moduleJson?.steps?.[session.step]
      const hints = stepContent?.hints || []
      const hintsUsed = (session.hintsUsed || 0) + 1
      const hintIndex = Math.min(hintsUsed - 1, hints.length - 1)
      const hintText = hints[hintIndex] || 'Re-read the step goal. What is the smallest test you could run?'

      if (apiEnabled()) {
        const data = await fetchLlmHint({
          skillId: session.skillId,
          moduleId: session.moduleId,
          step: session.step,
          track: session.track || profile?.track,
          hintsUsed,
          hintText,
          stepContent,
          why: brainSnapshot?.why,
          brainSnapshot,
          profile,
        })
        setHintState({
          curriculum: hintText,
          nudge: data.nudge || data.note,
          source: data.source,
        })
      } else {
        setHintState({ curriculum: hintText, nudge: hintText, source: 'curriculum' })
      }
    } catch {
      setHintState({ curriculum: null, nudge: 'Could not load hint. Run `synapsoul hint` in terminal.', source: 'error' })
    } finally {
      setHintLoading(false)
    }
  }, [session, profile, brainSnapshot])

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

      <BrainPanel snapshot={brainSnapshot} session={session} profile={profile} />

      {recommendedSkill && !rec && (
        <section className="card elevated recommend-card">
          <div className="card-badge">Recommended next</div>
          <h2 className="display-xs">{recommendedSkill.title}</h2>
          <p>{recommendedSkill.description}</p>
          <code className="cli-block">synapsoul start --skill {recommendedSkill.id}</code>
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
          <div className={`card-badge ${loggedIn && !hasCli ? '' : 'pulse'}`}>{sessionBadge}</div>
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
          <div className="session-actions">
            <button type="button" className="btn hint-btn" onClick={requestHint} disabled={hintLoading}>
              {hintLoading ? 'Loading hint…' : 'Get hint'}
            </button>
          </div>
          {hintState && (
            <div className="hint-result card">
              {hintState.curriculum && <p><strong>Curriculum:</strong> {hintState.curriculum}</p>}
              {hintState.nudge && hintState.nudge !== hintState.curriculum && (
                <p><strong>Nudge{hintState.source === 'llm' ? ' (SynapSoul LLM)' : ''}:</strong> {hintState.nudge}</p>
              )}
            </div>
          )}
          <p className="cursor-hint">
            This site is not the CLI. Instructors must run <code>synapsoul login</code> then
            {' '}<code>synapsoul start --json</code> before teaching — never invent CONTEXT from memory.
            {sessionKind === 'website' && loggedIn && ' Website login does not create IDE CLI events.'}
            {session.hintsUsed > 0 && <span className="hint-penalty"> · {session.hintsUsed} hint(s) used</span>}
          </p>
        </section>
      )}

      {!session && (
        <section className="card start-card elevated empty-state">
          <p className="section-eyebrow">First module</p>
          <h2 className="display-xs">No modules completed yet</h2>
          <p>Paste the universal prompt in your AI editor. The instructor must run <code>synapsoul login</code> then <code>synapsoul start --json</code> before teaching — never invent CONTEXT from memory.</p>
          <pre className="prompt-code oneline">{UNIVERSAL_PROMPT}</pre>
          <StartPromptCopy />
          <p className="cursor-hint">This dashboard is not the CLI. Evidence lands here after logged-in CLI commands sync.</p>
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
            <h3>Start in your editor</h3>
            <pre className="prompt-code oneline">{UNIVERSAL_PROMPT}</pre>
            <p className="cursor-hint">Then say <code>Start {selectedSkill.title}</code> in chat, or run:</p>
            <code className="cli-block">synapsoul start --skill {selectedSkill.id}</code>
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
        <p>Complete modules and submit evaluations to build your evidence portfolio. Nothing is listed until you ship a REFLECT artifact.</p>
        <p className="cursor-hint">Start with the universal prompt in Cursor — portfolio items appear here automatically.</p>
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
          <p className="section-eyebrow">Scored reasoning</p>
          <h2 className="display-xs">No dimension scores yet</h2>
          <p>Complete your first module REFLECT to see tradeoff, debugging, and production scores.</p>
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
        {terms.length === 0 ? (
          <section className="card empty-state elevated">
            <p className="section-eyebrow">Reference</p>
            <h2 className="display-xs">No matching terms</h2>
            <p>{filter ? `Nothing in the glossary matches “${filter}”.` : 'Glossary terms will appear here.'}</p>
          </section>
        ) : terms.map(t => (
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

function oauthErrorMessage(code) {
  const map = {
    github_taken: 'That GitHub account is already connected to another SynapSoul user',
    github_oauth_failed: 'GitHub sign-in failed. Try email, or check API OAuth env vars.',
    linkedin_oauth_failed: 'LinkedIn sign-in failed. You can still paste a LinkedIn URL on your profile.',
    linkedin_email_required: 'LinkedIn did not share an email. Paste your LinkedIn URL on your profile instead.',
    signin_required: 'Sign in before connecting a social account',
    missing_code: 'Sign-in was cancelled',
    access_denied: 'Sign-in was cancelled',
  }
  return map[code] || 'Sign-in did not complete'
}

function OAuthCatch({ route, onSuccess, onSetup, onError }) {
  const [cliCopy, setCliCopy] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPageMeta({ title: 'Signing in · SynapSoul', description: 'Finishing SynapSoul sign-in.' })
    let cancelled = false
    async function finish() {
      try {
        if (route.token) {
          setToken(route.token)
          const user = await fetchMe()
          if (cancelled) return
          if (route.cli === '1') {
            window.history.replaceState({}, '', '/#/auth/callback?cli=1')
            setCliCopy({ token: route.token, user })
            onSuccess({ token: route.token, user })
            return
          }
          window.history.replaceState({}, '', '/')
          if (window.location.hash) window.location.hash = ''
          onSuccess({ token: route.token, user })
          return
        }
        window.history.replaceState({}, '', '/')
        if (window.location.hash) window.location.hash = ''
        if (route.github === 'setup' || route.linkedin === 'setup') onSetup(route)
        else onError(oauthErrorMessage(route.error))
      } catch (e) {
        if (!cancelled) onError(humanizeApiError(e, 'Sign-in did not complete'))
      }
    }
    finish()
    return () => { cancelled = true }
  }, [])

  if (cliCopy) {
    const tokenCmd = `synapsoul login --token ${cliCopy.token}`
    return (
      <section className="card elevated auth-cli-complete" style={{ margin: '48px auto', maxWidth: 560 }}>
        <p className="section-eyebrow">CLI sign-in</p>
        <h2 className="display-xs">GitHub connected</h2>
        <p className="section-sub">
          Return to the IDE. <code>synapsoul login --github</code> should finish on its own.
          If it is still waiting, paste this token:
        </p>
        <pre className="cli-token-box">{tokenCmd}</pre>
        <div className="profile-preview-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              const ok = await copyText(cliCopy.token)
              setCopied(ok)
            }}
          >
            {copied ? 'Token copied' : 'Copy token'}
          </button>
          <button
            type="button"
            className="btn-primary btn-gradient"
            onClick={() => {
              window.history.replaceState({}, '', '/')
              if (window.location.hash) window.location.hash = ''
              window.location.reload()
            }}
          >
            Continue on the website
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card empty-state" style={{ margin: '48px auto', maxWidth: 480 }}>
      <p className="loading-text">Finishing sign-in…</p>
    </section>
  )
}

function CompletionCeremony({ progress }) {
  if (storageGet(...CEREMONY_KEYS)) return null
  storageSet('1', ...CEREMONY_KEYS)
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
  const entries = demo || []
  if (!entries.length) {
    return (
      <section className="card empty-state elevated">
        <p className="section-eyebrow">College analytics</p>
        <h2 className="display-xs">No cohort data yet</h2>
        <p>When students publish hiring profiles, readiness and evidence will show up here for partners.</p>
      </section>
    )
  }
  const avgReadiness = Math.round(entries.reduce((a, s) => a + (s.readiness_score || 0), 0) / entries.length)
  return (
    <>
      <div className="page-header">
        <p className="section-eyebrow">College analytics</p>
        <h2 className="display-sm">Student <em>insights</em></h2>
        <p className="section-sub">Cohort readiness from published hiring profiles.</p>
      </div>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{entries.length}</span>
          <span className="stat-label">Students</span>
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
        <p className="section-sub">Live data appears as students publish profiles.</p>
        <div className="leaderboard-list">
          {entries.map(e => (
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
  const cloud = Array.isArray(demo) ? demo : []
  if (!cloud.length && local.modules_completed === 0) {
    return (
      <>
        <div className="page-header">
          <p className="section-eyebrow">Rankings</p>
          <h2 className="display-sm">Leaderboard</h2>
        </div>
        <section className="card empty-state elevated">
          <h2 className="display-xs">No published rankings yet</h2>
          <p>Readiness scores appear as learners complete modules and publish hiring profiles. Your local progress stays private until you sign in.</p>
        </section>
      </>
    )
  }
  const entries = [local, ...cloud].sort((a, b) => b.readiness_score - a.readiness_score)

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
              #{i + 1}
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

function StartPromptCopy() {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function copy() {
    setError('')
    const ok = await copyText(UNIVERSAL_PROMPT)
    if (!ok) {
      setError('Could not copy. Select the prompt above and copy it manually.')
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="empty-actions">
      <button type="button" className="btn-primary" onClick={copy}>
        {copied ? 'Prompt copied' : 'Copy universal prompt'}
      </button>
      <a className="btn-secondary" href="/skill.md">
        Open instructor protocol
      </a>
      {copied && <p className="form-feedback is-success" role="status">Prompt copied to clipboard</p>}
      {error && <p className="form-feedback is-error" role="alert">{error}</p>}
    </div>
  )
}

function NotFoundView({ onHome, path }) {
  return (
    <section className="card empty-state not-found-page elevated">
      <p className="section-eyebrow">404</p>
      <h1 className="display-sm">This page isn’t in the bootcamp</h1>
      <p>No SynapSoul route for <code>{path || 'that URL'}</code>.</p>
      <button type="button" className="btn-primary" onClick={onHome}>Back to SynapSoul</button>
    </section>
  )
}

function ToastStack({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

function OnboardingWizard({ progress, catalog, onSaveProfile, onTryRegister, onComplete, onDismiss }) {
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

  async function handleStep1Next() {
    const profilePartial = {
      name,
      degree,
      bio,
      email: email || undefined,
      username: username || (email ? email.split('@')[0] : undefined),
      college_name: college,
    }
    onSaveProfile(profilePartial)
    if (email && password) {
      setSubmitting(true)
      await onTryRegister({
        ...profilePartial,
        password,
        college,
        track,
      })
      setSubmitting(false)
    }
    setStep(2)
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-wizard card elevated">
        <div className="onboarding-steps">
          {[1, 2, 3].map(n => (
            <span key={n} className={`onboarding-dot ${step >= n ? 'active' : ''}`}>{n}</span>
          ))}
        </div>

        <div className="onboarding-wizard-body">
          {step === 1 && (
            <>
              <p className="section-eyebrow">Step 1 of 3</p>
              <h2 className="display-xs">Your <em>profile</em></h2>
              <p className="section-sub">This unlocks your bootcamp and public hiring profile.</p>
              <label className="onboard-field">
                Name
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
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
            </>
          )}

          {step === 3 && (
            <>
              <p className="section-eyebrow">Step 3 of 3</p>
              <h2 className="display-xs">Start your <em>first module</em></h2>
              <p className="section-sub">Paste this in your AI editor. The instructor must run the CLI before teaching — never invent CONTEXT from memory.</p>
              <pre className="prompt-code oneline">{UNIVERSAL_PROMPT}</pre>
              <p className="cursor-hint">Required: <code>synapsoul login</code> then <code>synapsoul start --skill {foundation?.id} --track {track} --json</code></p>
            </>
          )}
        </div>

        <div className="onboard-actions">
          {step === 1 && (
            <>
              <button type="button" className="btn-secondary" onClick={onDismiss}>Skip</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!name || !degree || !bio || submitting}
                onClick={handleStep1Next}
              >
                {submitting ? 'Saving…' : 'Next →'}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button type="button" className="btn-primary" onClick={() => setStep(3)}>Next →</button>
            </>
          )}
          {step === 3 && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
