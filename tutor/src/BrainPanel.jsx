import { useEffect, useState } from 'react'
import { canSyncProgress, fetchCoachNote } from './api.js'

export function BrainPanel({ snapshot, session, profile }) {
  if (!snapshot?.recommendedNext && !snapshot?.mastery?.length) return null

  const rec = snapshot.recommendedNext
  const due = snapshot.dueReviews || []
  const signals = snapshot.recentSignals || []
  const mastery = snapshot.mastery || []
  const hintPct = Math.round((snapshot.hintDependency || 0) * 100)

  const [coach, setCoach] = useState(null)
  const [coachLoading, setCoachLoading] = useState(false)

  useEffect(() => {
    if (!canSyncProgress() || !snapshot) return
    let cancelled = false
    setCoachLoading(true)
    fetchCoachNote({
      event: session ? { type: 'session_step' } : { type: 'session' },
      skillId: session?.skillId,
      moduleId: session?.moduleId,
      step: session?.step,
      track: session?.track || profile?.track,
      why: snapshot.why,
      brainSnapshot: snapshot,
      profile,
    })
      .then(data => { if (!cancelled) setCoach(data) })
      .catch(() => { if (!cancelled) setCoach(null) })
      .finally(() => { if (!cancelled) setCoachLoading(false) })
    return () => { cancelled = true }
  }, [
    snapshot?.updatedAt,
    snapshot?.eventCount,
    session?.skillId,
    session?.moduleId,
    session?.step,
    profile?.track,
  ])

  return (
    <section className="brain-panel">
      <div className="brain-panel-head">
        <p className="section-eyebrow">LearnLab Brain</p>
        <h2 className="display-xs">Adaptive <em>engine</em></h2>
        <p className="section-sub">
          Bayesian knowledge tracing + spaced repetition · {snapshot.eventCount || 0} learning events
          {snapshot.preferredPace ? ` · ${snapshot.preferredPace} pace` : ''}
        </p>
      </div>

      {(coach?.note || coachLoading) && (
        <div className="card elevated brain-coach">
          <div className="brain-coach-head">
            <span className="card-badge">Instructor note</span>
            {coach?.source && (
              <span className={`coach-source coach-source-${coach.source}`}>
                {coach.source === 'llm' ? 'LearnLab LLM' : 'heuristic'}
              </span>
            )}
          </div>
          {coachLoading ? (
            <p className="brain-empty">Loading coach note…</p>
          ) : (
            <p className="brain-coach-note">{coach.note}</p>
          )}
        </div>
      )}

      {rec && (
        <div className="card elevated brain-next">
          <div className="brain-next-top">
            <span className="card-badge">Recommended next</span>
            <span className={`diff-pill diff-${snapshot.predictedDifficulty || 'medium'}`}>
              {snapshot.predictedDifficulty || 'medium'}
            </span>
          </div>
          <h3 className="display-xs">{rec.moduleTitle}</h3>
          <p className="brain-skill-line">{rec.skillTitle}</p>
          <p className="brain-why">{snapshot.why}</p>
          <code className="cli-block">npm run tutor -- start --skill {rec.skillId}</code>
        </div>
      )}

      <div className="brain-grid">
        <div className="card elevated brain-mastery">
          <h3>Mastery by skill</h3>
          <div className="brain-bars">
            {mastery.map(s => (
              <div key={s.id} className="brain-bar-row">
                <div className="brain-bar-meta">
                  <span>{s.title}</span>
                  <span>{Math.round(s.blended * 100)}%</span>
                </div>
                <div className="brain-bar">
                  <div
                    className="brain-bar-fill"
                    style={{ width: `${Math.round(s.blended * 100)}%`, background: s.color || undefined }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card elevated brain-side">
          <h3>Due reviews</h3>
          {due.length === 0 && !(snapshot.upcomingReviews || []).length ? (
            <p className="brain-empty">No spaced reviews yet. Complete a module to schedule the first interval.</p>
          ) : due.length === 0 ? (
            <ul className="brain-due-list">
              {(snapshot.upcomingReviews || []).slice(0, 4).map(d => (
                <li key={`${d.skillId}:${d.moduleId}`}>
                  <strong>{d.moduleTitle}</strong>
                  <span>{d.skillTitle} · in {d.interval}d · SM-2</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="brain-due-list">
              {due.slice(0, 5).map(d => (
                <li key={`${d.skillId}:${d.moduleId}`}>
                  <strong>{d.moduleTitle}</strong>
                  <span>{d.skillTitle} · {d.interval}d interval · due now</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="brain-side-h">Recent signal</h3>
          {signals.length === 0 ? (
            <p className="brain-empty">Start a module — hints, VERIFY, and scores update this feed.</p>
          ) : (
            <ul className="brain-signals">
              {signals.slice(0, 6).map((s, i) => (
                <li key={i} className={`signal-${s.kind || 'event'}`}>{s.label}</li>
              ))}
            </ul>
          )}

          <div className="brain-meta-row">
            <span>Hint dependency <strong>{hintPct}%</strong></span>
            {snapshot.struggles?.[0] && (
              <span>Focus <strong>{snapshot.struggles[0].title}</strong></span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
