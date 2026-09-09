import { useEffect, useState } from 'react'
import { canSyncProgress, fetchCoachNote, fetchLearningStats, reactToInteraction } from './api.js'

export function BrainPanel({ snapshot, session, profile }) {
  if (!snapshot?.recommendedNext && !snapshot?.mastery?.length) return null

  const rec = snapshot.recommendedNext
  const due = snapshot.dueReviews || []
  const signals = snapshot.recentSignals || []
  const mastery = snapshot.mastery || []
  const hintPct = Math.round((snapshot.hintDependency || 0) * 100)

  const [coach, setCoach] = useState(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [learningStats, setLearningStats] = useState(null)
  const [reactionSent, setReactionSent] = useState(null)
  const [reacting, setReacting] = useState(false)

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

  useEffect(() => {
    if (!canSyncProgress()) return
    fetchLearningStats()
      .then(setLearningStats)
      .catch(() => setLearningStats(null))
  }, [coach?.interactionId, reactionSent])

  async function handleReaction(reaction) {
    if (!coach?.interactionId || reacting) return
    setReacting(true)
    try {
      await reactToInteraction(coach.interactionId, reaction)
      setReactionSent(reaction)
    } catch {
      setReactionSent(null)
    } finally {
      setReacting(false)
    }
  }

  const patternCount = learningStats?.patterns ?? 0
  const lastInsight = learningStats?.recentPatterns?.slice(-1)[0]

  return (
    <section className="brain-panel">
      <div className="brain-panel-head">
        <p className="section-eyebrow">LearnLab Brain</p>
        <h2 className="display-xs">Adaptive <em>engine</em></h2>
        <p className="section-sub">
          Bayesian knowledge tracing + spaced repetition · {snapshot.eventCount || 0} learning events
          {snapshot.preferredPace ? ` · ${snapshot.preferredPace} pace` : ''}
        </p>
        {canSyncProgress() && learningStats && (
          <p className="learning-indicator" title="LearnLab improves from reactions and outcomes">
            <span className="learning-dot" />
            LearnLab is learning · {patternCount} pattern{patternCount !== 1 ? 's' : ''}
            {lastInsight ? ` · "${lastInsight.slice(0, 60)}${lastInsight.length > 60 ? '…' : ''}"` : ''}
          </p>
        )}
      </div>

      {(coach?.note || coachLoading) && (
        <div className="card elevated brain-coach">
          <div className="brain-coach-head">
            <span className="card-badge">Instructor note</span>
            <div className="brain-coach-actions">
              {coach?.source && (
                <span className={`coach-source coach-source-${coach.source}`}>
                  {coach.source === 'llm' ? 'LearnLab LLM' : 'heuristic'}
                </span>
              )}
              {coach?.interactionId && canSyncProgress() && (
                <div className="reaction-btns">
                  <button
                    type="button"
                    className={`reaction-btn ${reactionSent === 'helpful' ? 'active' : ''}`}
                    disabled={reacting || !!reactionSent}
                    onClick={() => handleReaction('helpful')}
                    title="Helpful"
                    aria-label="Mark coach note as helpful"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    className={`reaction-btn ${reactionSent === 'not_helpful' ? 'active' : ''}`}
                    disabled={reacting || !!reactionSent}
                    onClick={() => handleReaction('not_helpful')}
                    title="Not helpful"
                    aria-label="Mark coach note as not helpful"
                  >
                    👎
                  </button>
                </div>
              )}
            </div>
          </div>
          {coachLoading ? (
            <p className="brain-empty">Loading coach note…</p>
          ) : (
            <>
              <p className="brain-coach-note">{coach.note}</p>
              {reactionSent === 'helpful' && (
                <p className="reaction-thanks">Thanks — LearnLab will use this to improve future hints.</p>
              )}
            </>
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
