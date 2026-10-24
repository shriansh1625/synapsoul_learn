import { useEffect, useRef, useState } from 'react'
import { fetchNemotronStatus, requestNemotronReview } from './api.js'
import './NemotronCoach.css'

const LABELS = {
  strength: 'Build on this',
  risk: 'Challenge this assumption',
  experiment: 'Run a small test',
  question: 'Think one step further',
}
export default function NemotronCoach({ user, session, onNeedAuth }) {
  const [status, setStatus] = useState(null)
  const [statusAttempt, setStatusAttempt] = useState(0)
  const [reasoning, setReasoning] = useState('')
  const [consent, setConsent] = useState(false)
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(null)
  const hasSession =
    session?.source === 'cli' &&
    ['DECIDE', 'BUILD', 'VERIFY', 'BREAK', 'FIX', 'REFLECT'].includes(
      session.step,
    )
  useEffect(() => {
    const controller = new AbortController()
    setStatus(null)
    fetchNemotronStatus({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ enabled: false })
      })
    return () => controller.abort()
  }, [statusAttempt])
  useEffect(() => {
    requestRef.current?.abort()
    setReview(null)
    setReasoning('')
    setConsent(false)
    setError('')
    setLoading(false)
    return () => requestRef.current?.abort()
  }, [user?.id, session?.skillId, session?.moduleId])
  async function submit(event) {
    event.preventDefault()
    if (!user) return onNeedAuth?.()
    setError('')
    setReview(null)
    setLoading(true)
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const result = await requestNemotronReview(
        { reasoning, consent },
        { signal: controller.signal },
      )
      if (!controller.signal.aborted) setReview(result)
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err.message || 'The coach is unavailable. Try again later.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  return (
    <section
      className="nemotron-coach card elevated"
      aria-labelledby="nemotron-title"
    >
      <div className="nemotron-head">
        <div>
          <span className="nemotron-label">
            <span aria-hidden="true" /> NVIDIA NEMOTRON
          </span>
          <h2 id="nemotron-title">
            A second perspective.
            <br />
            <em>A stronger decision.</em>
          </h2>
          <p>
            Explain your engineering choice. Get one strength, one assumption to
            challenge, a test to try, and a question to think through.
          </p>
        </div>
        <span className="nemotron-pilot">LIMITED PILOT</span>
      </div>
      {!user ? (
        <div className="nemotron-empty">
          <p>
            Sign in and reach DECIDE in your CLI session to review your own
            reasoning.
          </p>
          <button
            type="button"
            className="nemotron-button"
            onClick={onNeedAuth}
          >
            Sign in to use the coach <span aria-hidden="true">↗</span>
          </button>
        </div>
      ) : !hasSession ? (
        <div className="nemotron-empty">
          <h3>Your decision comes first.</h3>
          <p>
            Run <code>synapsoul login</code>, then{' '}
            <code>synapsoul start --json</code> in your AI editor. Reach DECIDE
            and sync your session before requesting feedback.
          </p>
          <p>
            The coach uses your real curriculum exercise; it does not create a
            lesson or complete your implementation.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="nemotron-form">
          <label htmlFor="nemotron-reasoning">
            Explain the choice you made and why
          </label>
          <textarea
            id="nemotron-reasoning"
            value={reasoning}
            onChange={(e) => {
              setReasoning(e.target.value)
              setReview(null)
            }}
            minLength={40}
            maxLength={2000}
            required
            disabled={loading}
            rows={5}
            placeholder="Describe the option you chose, your constraints, and the tradeoff you are accepting."
            aria-describedby="nemotron-privacy"
          />
          <div className="nemotron-input-meta">
            <span>
              Current CLI module: {session.moduleId.replace(/-/g, ' ')}
            </span>
            <span>{reasoning.length} / 2,000</span>
          </div>
          <label className="nemotron-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              disabled={loading}
            />
            <span id="nemotron-privacy">
              Send this explanation and the current decision exercise to
              NVIDIA’s hosted API for review. Do not include credentials,
              personal data, or confidential code.
            </span>
          </label>
          <button
            type="submit"
            className="nemotron-button"
            disabled={
              loading ||
              !status?.enabled ||
              !consent ||
              reasoning.trim().length < 40
            }
          >
            {loading
              ? 'Nemotron is reviewing your decision…'
              : 'Review with Nemotron'}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
      )}
      {!status && (
        <p className="nemotron-status" role="status">
          Checking coach availability…
        </p>
      )}
      {status && !status.enabled && (
        <div className="nemotron-status">
          <p role="status">
            The NVIDIA coach is temporarily unavailable. Your learning session
            can continue.
          </p>
          <button
            type="button"
            className="nemotron-retry"
            onClick={() => setStatusAttempt((n) => n + 1)}
          >
            Check again
          </button>
        </div>
      )}
      {error && (
        <p className="nemotron-error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <div className="nemotron-result" aria-live="polite">
          <div className="nemotron-result-meta">
            <span>REVIEW OF {review.moduleTitle}</span>
            <span>
              {review.provider} · {review.model.split('/').pop()}
            </span>
          </div>
          <div className="nemotron-review-grid">
            {Object.entries(LABELS).map(([key, label], i) => (
              <article key={key}>
                <span>
                  0{i + 1} / {label}
                </span>
                <p>{review.review[key]}</p>
              </article>
            ))}
          </div>
          <p className="nemotron-result-note">
            Use this as a thinking partner, not a grade. Verify the suggestions;
            this review does not mark a module complete or change your mastery
            scores.
          </p>
        </div>
      )}
      <div className="nemotron-foot">
        <span>
          Up to 3 review attempts per learner/day · shared pilot allowance
        </span>
        <a
          href="https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer"
          target="_blank"
          rel="noreferrer"
        >
          About the model ↗
        </a>
      </div>
    </section>
  )
}
