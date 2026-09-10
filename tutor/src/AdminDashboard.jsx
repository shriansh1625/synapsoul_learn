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
      <p>No LearnLab route for <code>/admin</code>.</p>
      <button type="button" className="btn-primary" onClick={onHome}>Back to LearnLab</button>
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
  const code = err?.code
  const text = err?.apiError || err?.message || ''
  if (code === 'OTP_RATE_LIMITED') return text || 'Wait 60 seconds before requesting another code.'
  if (code === 'GMAIL_NOT_CONFIGURED') {
    return text || 'Gmail is not configured. Set GMAIL_APP_PASSWORD on the Render API service.'
  }
  if (code === 'GMAIL_SEND_FAILED') {
    return text || 'Could not send the code. Check GMAIL_APP_PASSWORD on Render, or Gmail SMTP may be blocked.'
  }
  if (code === 'TIMEOUT' || /timed out|aborted/i.test(text)) {
    return 'Sending timed out. Gmail SMTP may be hanging on Render. Set GMAIL_APP_PASSWORD, or smtp.gmail.com:587 may be blocked.'
  }
  if (!text || /failed to fetch|network|could not reach/i.test(text)) {
    return 'Could not reach LearnLab. Check your connection and try again.'
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
      <button type="button" className="btn-secondary" onClick={onHome}>Back to LearnLab</button>
    </section>
  )
}

function AdminDashboard({ overview, onHome }) {
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    setPageMeta({
      title: 'Cohort admin · LearnLab',
      description: 'Private LearnLab cohort dashboard. Admin only.',
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
  const snapshot = detail?.brain?.snapshot
  const profile = detail?.profile
  const session = detail?.progress?.session
  const completed = Object.keys(detail?.progress?.completedModules || {})

  return (
    <div className="admin-shell">
      <header className="admin-banner">
        <div>
          <p className="section-eyebrow">Admin only · private</p>
          <h1 className="display-sm">Cohort dashboard</h1>
          <p className="admin-sub">Student progress, brain, and profiles. Not visible to students.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onHome}>Back to LearnLab</button>
      </header>

      <div className="admin-stats">
        <article className="admin-stat">
          <span>Students</span>
          <strong>{stats.students ?? students.length}</strong>
        </article>
        <article className="admin-stat">
          <span>Modules completed</span>
          <strong>{stats.modules_completed ?? '—'}</strong>
        </article>
        <article className="admin-stat">
          <span>Active (7 days)</span>
          <strong>{stats.active_7d ?? '—'}</strong>
        </article>
      </div>

      {error && <p className="form-feedback is-error" role="alert">{error}</p>}

      <div className="admin-layout">
        <section className="card elevated admin-table-wrap">
          <h2>Cohort</h2>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Track</th>
                  <th>Modules</th>
                  <th>Readiness</th>
                  <th>GitHub</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr
                    key={s.id}
                    className={selectedId === s.id ? 'is-selected' : ''}
                    onClick={() => openStudent(s.id)}
                  >
                    <td>{s.name || '—'}</td>
                    <td>{s.email}</td>
                    <td>{s.username || '—'}</td>
                    <td>{s.track}</td>
                    <td>{s.modules_completed}</td>
                    <td>{s.readiness}</td>
                    <td>{s.github || '—'}</td>
                    <td>{formatWhen(s.last_seen)}</td>
                  </tr>
                ))}
                {!students.length && (
                  <tr>
                    <td colSpan={8}>No students yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card elevated admin-detail">
          <p className="section-eyebrow">Admin only</p>
          {!selectedId && <p>Select a student to see private progress, brain, and profile.</p>}
          {loadingDetail && <p>Loading…</p>}
          {detail && profile && (
            <>
              <h2>{profile.name || profile.email}</h2>
              <dl className="admin-dl">
                <div><dt>Email</dt><dd>{profile.email}</dd></div>
                <div><dt>Username</dt><dd>{profile.username || '—'}</dd></div>
                <div><dt>Track</dt><dd>{profile.track || '—'}</dd></div>
                <div><dt>GitHub</dt><dd>{profile.github_username || '—'}</dd></div>
                <div><dt>Readiness</dt><dd>{detail.readiness}</dd></div>
                <div><dt>Last seen</dt><dd>{formatWhen(profile.last_seen)}</dd></div>
                <div><dt>Headline</dt><dd>{profile.headline || '—'}</dd></div>
                <div><dt>Bio</dt><dd>{profile.bio || '—'}</dd></div>
              </dl>

              <h3>Session</h3>
              {session ? (
                <p>{session.skillId} / {session.moduleId} · {session.step} · hints {session.hintsUsed || 0}</p>
              ) : <p>No active session.</p>}

              <h3>Modules completed</h3>
              <p>{completed.length ? completed.join(', ') : 'None yet.'}</p>

              <h3>Brain snapshot</h3>
              {snapshot ? (
                <ul className="admin-brain">
                  <li>Events: {snapshot.eventCount ?? 0}</li>
                  <li>Pace: {snapshot.preferredPace || '—'}</li>
                  <li>Track: {snapshot.preferredTrack || '—'}</li>
                  <li>Next: {snapshot.recommendedNext?.title || snapshot.recommendedNext?.id || '—'}</li>
                  <li>Why: {snapshot.why || '—'}</li>
                </ul>
              ) : <p>No brain snapshot yet.</p>}

              <h3>Recent events</h3>
              <ul className="admin-events">
                {(detail.events || []).slice(0, 16).map((ev, i) => (
                  <li key={`${ev.type}-${i}`}>
                    <strong>{ev.type}</strong>
                    {ev.skill_id ? ` · ${ev.skill_id}` : ''}
                    {ev.module_id ? `/${ev.module_id}` : ''}
                    {ev.detail ? ` — ${ev.detail}` : ''}
                    {ev.at ? ` · ${formatWhen(ev.at)}` : ''}
                  </li>
                ))}
                {!(detail.events || []).length && <li>No events yet.</li>}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
