import { useEffect, useState } from 'react'
import {
  isLoggedIn,
  fetchAdminOverview,
  fetchAdminStudents,
  fetchAdminStudent,
  requestAdminOtp,
  verifyAdminOtp,
  setAdminOtp,
} from './api.js'
import { setPageMeta } from './siteUtils.js'

function formatWhen(value) {
  if (!value) return 'Never'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function NotFoundAdmin({ onHome }) {
  return (
    <section className="card empty-state not-found-page elevated">
      <p className="section-eyebrow">404</p>
      <h1 className="display-sm">This page isn’t in the bootcamp</h1>
      <p>No SynapSoul route for <code>/admin</code>.</p>
      <button type="button" className="btn-primary" onClick={onHome}>Back to SynapSoul</button>
    </section>
  )
}

export default function AdminGate({ onHome }) {
  const [phase, setPhase] = useState('loading')
  const [overview, setOverview] = useState(null)

  async function loadOverview() {
    try {
      const data = await fetchAdminOverview()
      setOverview(data)
      setPhase('admin')
    } catch (err) {
      if (err?.code === 'OTP_REQUIRED') {
        setPhase('otp')
        return
      }
      setPhase('denied')
    }
  }

  useEffect(() => {
    if (!isLoggedIn()) {
      setPhase('denied')
      return
    }
    loadOverview()
  }, [])

  if (phase === 'loading') {
    return <NotFoundAdmin onHome={onHome} />
  }

  if (phase === 'admin') {
    return <AdminDashboard overview={overview} onHome={onHome} />
  }

  if (phase === 'otp') {
    return <AdminOtpChallenge onVerified={loadOverview} onHome={onHome} />
  }

  return <NotFoundAdmin onHome={onHome} />
}

function otpRequestErrorMessage(err) {
  const serverText = String(err?.apiError || '').trim()
  if (serverText) return serverText
  const code = err?.code
  const text = String(err?.message || '').trim()
  if (code === 'OTP_RATE_LIMITED') return text || 'Wait 60 seconds before requesting another code.'
  if (code === 'MAILER_NOT_CONFIGURED' || code === 'RESEND_SEND_FAILED') {
    return (
      text ||
      'RESEND_API_KEY is missing on the Render API service. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'
    )
  }
  if (code === 'TIMEOUT' || /timed out|aborted/i.test(text)) {
    return 'Sending timed out. Create a free account at resend.com, open API Keys, paste the key on the Render API service as RESEND_API_KEY, then redeploy.'
  }
  if (!text || /failed to fetch|network|could not reach/i.test(text)) {
    return 'Could not reach SynapSoul. Check your connection and try again.'
  }
  return text || 'Could not send the code.'
}

function AdminOtpChallenge({ onVerified, onHome }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown(n => Math.max(0, n - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode() {
    setError('')
    setSending(true)
    try {
      const data = await requestAdminOtp()
      setSent(true)
      setCooldown(Number(data.retryAfter) || 60)
    } catch (err) {
      if (err?.code === 'OTP_RATE_LIMITED') {
        setSent(true)
        setCooldown(Number(err.retryAfter) || 60)
      }
      setError(otpRequestErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setVerifying(true)
    try {
      const data = await verifyAdminOtp(code)
      setAdminOtp(data.token)
      setCode('')
      await onVerified()
    } catch (err) {
      setError(err.apiError || err.message || 'Invalid code.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <section className="card empty-state not-found-page elevated admin-otp">
      <p className="section-eyebrow">Admin verification</p>
      <h1 className="display-sm">Confirm it’s you</h1>
      <p>Send a 6-digit code to Gmail, then enter it here. Codes expire in 10 minutes.</p>
      <div className="admin-otp-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={sendCode}
          disabled={sending || cooldown > 0}
        >
          {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : sent ? 'Resend code to Gmail' : 'Send code to Gmail'}
        </button>
      </div>
      <form className="admin-otp-form" onSubmit={handleVerify}>
        <label className="field-label" htmlFor="admin-otp-code">6-digit code</label>
        <input
          id="admin-otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
        />
        <button type="submit" className="btn-secondary" disabled={code.length !== 6 || verifying}>
          {verifying ? 'Checking…' : 'Verify'}
        </button>
      </form>
      {error && <p className="form-feedback is-error" role="alert">{error}</p>}
      <button type="button" className="btn-secondary" onClick={onHome}>Back to SynapSoul</button>
    </section>
  )
}

function formatRelative(value) {
  if (!value) return null
  const t = new Date(value).getTime()
  if (Number.isNaN(t)) return formatWhen(value)
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return formatWhen(value)
}

function activityLabel(student) {
  if (student?.has_cli || student?.activity === 'ide_cli') return 'IDE CLI'
  if (student?.last_seen || student?.activity === 'website') return 'Website'
  return 'None'
}

function matchesQuery(student, query) {
  if (!query) return true
  const hay = [student.name, student.email, student.username, student.github]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(query)
}

function AdminDashboard({ overview, onHome }) {
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [query, setQuery] = useState('')
  const [showTest, setShowTest] = useState(false)

  useEffect(() => {
    setPageMeta({
      title: 'Cohort admin · SynapSoul',
      description: 'Private SynapSoul cohort dashboard. Admin only.',
    })
    fetchAdminStudents()
      .then(data => setStudents(data.students || []))
      .catch(err => {
        if (err?.code === 'OTP_REQUIRED') setError('Admin verification expired. Refresh and enter a new code.')
        else setError('Could not load cohort.')
      })
  }, [])

  async function openStudent(id) {
    setSelectedId(id)
    setLoadingDetail(true)
    setDetail(null)
    try {
      setDetail(await fetchAdminStudent(id))
    } catch {
      setError('Could not load that student.')
    } finally {
      setLoadingDetail(false)
    }
  }

  const stats = overview || {}
  const q = query.trim().toLowerCase()
  const visible = students.filter(s => (showTest || !s.is_test) && matchesQuery(s, q))
  const hiddenTestCount = students.filter(s => s.is_test).length
  const selected = students.find(s => s.id === selectedId)
  const snapshot = detail?.brain?.snapshot
  const profile = detail?.profile
  const session = detail?.progress?.session
  const completed = Object.keys(detail?.progress?.completedModules || {})
  const cliEvents = detail?.cli_events || []
  const hasCli = Boolean(detail?.has_cli) || cliEvents.length > 0
  const sessionKind = detail?.session_kind || (session ? (hasCli ? 'cli_sync' : 'website') : 'none')
  const websiteLastSeen = detail?.website_last_seen || profile?.last_seen

  return (
    <div className="admin-shell">
      <header className="admin-banner">
        <div>
          <p className="section-eyebrow">Private · admin</p>
          <h1 className="display-sm">Cohort</h1>
          <p className="admin-sub">
            Two channels, never mixed. <strong>Website session</strong> is site login / dashboard
            (last_seen). <strong>IDE CLI</strong> is only <code>cli_events</code> from
            {' '}<code>synapsoul login</code> then tutor commands. Chat without the CLI is invisible here.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onHome}>Back to SynapSoul</button>
      </header>

      <div className="admin-stats">
        <article className="admin-stat">
          <span>Students</span>
          <strong>{stats.students ?? visible.length}</strong>
        </article>
        <article className="admin-stat">
          <span>Modules completed</span>
          <strong>{stats.modules_completed ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>Website active (7d)</span>
          <strong>{stats.website_active_7d ?? stats.active_7d ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>Last IDE CLI</span>
          <strong>{formatRelative(stats.last_cli_at) || 'None yet'}</strong>
        </article>
      </div>

      {error && <p className="form-feedback is-error" role="alert">{error}</p>}

      <div className="admin-layout">
        <section className="card elevated admin-roster">
          <div className="admin-roster-head">
            <h2>Students</h2>
            <p className="admin-roster-meta">{visible.length} shown</p>
          </div>
          <div className="admin-toolbar">
            <label className="admin-search">
              <span className="visually-hidden">Search cohort</span>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, email, username"
              />
            </label>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={showTest}
                onChange={e => setShowTest(e.target.checked)}
              />
              <span>Show test accounts</span>
            </label>
          </div>
          {!showTest && hiddenTestCount > 0 && (
            <p className="admin-test-note">{hiddenTestCount} test account{hiddenTestCount === 1 ? '' : 's'} hidden (@test.local / Live Audit Bot)</p>
          )}
          <ul className="admin-student-list">
            {visible.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  className={selectedId === s.id ? 'admin-student is-selected' : 'admin-student'}
                  onClick={() => openStudent(s.id)}
                >
                  <span className="admin-student-main">
                    <strong>{s.name || s.email}</strong>
                    <span>{s.email}</span>
                  </span>
                  <span className={`admin-student-cli ${s.has_cli ? 'is-cli' : 'is-website'}`}>
                    <em>{s.has_cli ? commandLabel(s.last_cli_command) : activityLabel(s)}</em>
                    <span>
                      {s.has_cli
                        ? (s.last_cli_at ? formatRelative(s.last_cli_at) : '—')
                        : (s.last_seen ? formatRelative(s.last_seen) : '—')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!visible.length && (
              <li className="admin-empty-row">No students match this filter.</li>
            )}
          </ul>
        </section>

        <section className="card elevated admin-inspector">
          <p className="section-eyebrow">Inspector</p>
          {!selectedId && <p className="admin-inspector-empty">Select a student to inspect website login vs IDE CLI.</p>}
          {loadingDetail && <p>Loading…</p>}
          {detail && profile && (
            <>
              <h2>{profile.name || profile.email}</h2>
              <p className={`admin-origin-banner ${hasCli ? 'is-cli' : 'is-website'}`}>
                {hasCli
                  ? 'IDE CLI is posting events. Website login is tracked separately below.'
                  : 'Website only — no IDE CLI events. Chat lessons are not tracked. last_seen is website login, not the IDE.'}
              </p>
              <dl className="admin-dl">
                <div><dt>Name</dt><dd>{profile.name || '—'}</dd></div>
                <div><dt>Email</dt><dd>{profile.email}</dd></div>
                <div><dt>Username</dt><dd>{profile.username || '—'}</dd></div>
                <div><dt>GitHub</dt><dd>{profile.github_username || selected?.github || '—'}</dd></div>
                <div><dt>Track</dt><dd>{profile.track || '—'}</dd></div>
                <div><dt>Readiness</dt><dd>{detail.readiness}</dd></div>
                <div>
                  <dt>Website login</dt>
                  <dd>{formatWhen(websiteLastSeen)}</dd>
                </div>
                <div>
                  <dt>IDE CLI</dt>
                  <dd>
                    {hasCli && (selected?.last_cli_at || cliEvents[0]?.at)
                      ? `${commandLabel(selected?.last_cli_command || cliEvents[0]?.type)} · ${formatWhen(selected?.last_cli_at || cliEvents[0]?.at)}`
                      : 'None — instructor never ran synapsoul login + synapsoul start'}
                  </dd>
                </div>
              </dl>

              <h3>{sessionKind === 'website' ? 'Website session' : sessionKind === 'cli_sync' ? 'Cloud session (last CLI sync)' : 'Website session'}</h3>
              {session ? (
                <>
                  <p className="admin-session">
                    <span className={`admin-pill ${sessionKind === 'website' ? 'is-website' : 'is-cli'}`}>
                      {sessionKind === 'website' ? 'Website' : 'CLI sync'}
                    </span>
                    <code>{session.skillId}</code>
                    <span>/</span>
                    <code>{session.moduleId}</code>
                    <span className="admin-pill">{session.step}</span>
                    <span className="admin-muted">hints {session.hintsUsed || 0}</span>
                  </p>
                  {sessionKind === 'website' && (
                    <p className="admin-session-note">
                      Not IDE tracking. This cloud row is the site default or PUT /api/progress/session
                      (often system-design-fundamentals / http-basics / CONTEXT). Teaching in chat without
                      the CLI does not move this.
                    </p>
                  )}
                </>
              ) : <p className="admin-muted">No website/cloud session row.</p>}

              <h3>Modules completed</h3>
              <p>{completed.length ? completed.join(', ') : 'None yet.'}</p>

              <h3>IDE CLI</h3>
              {!hasCli ? (
                <p className="admin-empty-cli">
                  No IDE CLI events. Do not treat the website session as proof they learned in Antigravity,
                  Cursor, or any IDE. The student must run <code>synapsoul login</code> then
                  {' '}<code>synapsoul start</code> so start / next / hint / decide / complete / sync post here.
                </p>
              ) : (
                <ol className="admin-timeline">
                  {cliEvents.map((ev, i) => (
                    <li key={`${ev.type}-${ev.at}-${i}`}>
                      <time dateTime={ev.at || undefined}>{ev.at ? formatWhen(ev.at) : '—'}</time>
                      <div>
                        <strong>{commandLabel(ev.type)}</strong>
                        {(ev.skill_id || ev.module_id) && (
                          <span className="admin-timeline-loc">
                            {[ev.skill_id, ev.module_id].filter(Boolean).join(' / ')}
                            {ev.step ? ` · ${ev.step}` : ''}
                          </span>
                        )}
                        {ev.hints_used != null && ev.type === 'hint' && (
                          <span className="admin-muted"> · hint {ev.hints_used}</span>
                        )}
                        {ev.detail && ev.type !== 'hint' && (
                          <span className="admin-muted"> · {ev.detail}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              <h3>Brain snapshot</h3>
              {snapshot ? (
                <ul className="admin-brain">
                  <li>Events: {snapshot.eventCount ?? 0}</li>
                  <li>Pace: {snapshot.preferredPace || '—'}</li>
                  <li>Track: {snapshot.preferredTrack || '—'}</li>
                  <li>Next: {snapshot.recommendedNext?.title || snapshot.recommendedNext?.id || '—'}</li>
                  <li>Why: {snapshot.why || '—'}</li>
                </ul>
              ) : <p className="admin-muted">No brain snapshot yet.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
