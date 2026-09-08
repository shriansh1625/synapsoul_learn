import { useState } from 'react'
import { login, register } from './api.js'

export default function AuthModal({ onClose, onSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card elevated auth-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        <p className="section-eyebrow">{mode === 'login' ? 'Welcome back' : 'Create account'}</p>
        <h2 className="display-xs">{mode === 'login' ? 'Sign in' : 'Register'}</h2>
        <p className="section-sub">Sync progress across devices with cloud storage.</p>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <>
              <label className="onboard-field">
                Name
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
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
      </div>
    </div>
  )
}
