import { useState, useEffect } from 'react'
import { login, register, fetchAuthProviders, oauthStartUrl } from './api.js'
import { humanizeApiError } from './siteUtils.js'

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [githubReady, setGithubReady] = useState(false)
  const [githubChecked, setGithubChecked] = useState(false)

  useEffect(() => {
    fetchAuthProviders()
      .then(p => setGithubReady(Boolean(p.github)))
      .catch(() => setGithubReady(false))
      .finally(() => setGithubChecked(true))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await login({ email, password })
        : await register({ email, password, name, username: username || email.split('@')[0] })
      onSuccess(result)
    } catch (err) {
      setError(humanizeApiError(err, mode === 'login'
        ? 'Could not sign in. Check your email and password.'
        : 'Could not create your account. Try a different email or username.'))
    } finally {
      setLoading(false)
    }
  }

  function startGithub() {
    if (!githubReady) return
    window.location.href = oauthStartUrl('github')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card elevated auth-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <p className="section-eyebrow">{mode === 'login' ? 'Welcome back' : 'Create account'}</p>
        <h2 className="display-xs">{mode === 'login' ? 'Sign in' : 'Register'}</h2>
        <p className="section-sub">Same account as the IDE CLI. After this, run synapsoul login --email … so IDE events attach to you.</p>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
        </div>

        {githubChecked && (
          <div className="auth-oauth">
            <button
              type="button"
              className="btn-secondary oauth-connect-btn auth-github-btn"
              disabled={!githubReady}
              onClick={startGithub}
            >
              <GitHubIcon />
              {githubReady ? 'Continue with GitHub' : 'GitHub unavailable — use email'}
            </button>
            {!githubReady && (
              <p className="field-hint">
                GitHub sign-in is not available on the API right now. Register with email here, then in the IDE run synapsoul login --email … 
              </p>
            )}
            <p className="auth-or">or email</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <>
              <label className="onboard-field">
                Name
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required />
              </label>
              <label className="onboard-field">
                Username
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="your-handle" />
              </label>
            </>
          )}
          <label className="onboard-field">
            Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@college.edu" required />
          </label>
          <label className="onboard-field">
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn-primary btn-gradient" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {mode === 'register' && <p className="field-hint">New profiles are private. You can choose to publish your profile and learning evidence in profile settings.</p>}
        <p className="auth-cli-hint">
          IDE: <code>synapsoul register --email … --password … --name …</code> or <code>synapsoul login --github</code>.
          Or register here, then <code>synapsoul login --email …</code>
        </p>
      </div>
    </div>
  )
}
