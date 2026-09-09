import { readStore, writeStore } from './localStore.js'
import { getExperienceStore } from './ExperienceStore.js'
import { getLearningEngine } from './LearningEngine.js'

const MODULE_COMPLETE_HOURS = 24
const RECENT_WINDOW_MS = 4 * 60 * 60 * 1000

function recentInteractions(userId, type = null) {
  const interactions = readStore('interactions', [])
  const cutoff = Date.now() - RECENT_WINDOW_MS
  return interactions
    .filter(i => {
      if (userId && i.user_id !== userId) return false
      if (type && i.type !== type) return false
      return new Date(i.created_at).getTime() >= cutoff
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

const SIGNAL_SCORES = {
  module_complete: 0.9,
  verify_pass: 0.7,
  session_continued: 0.4,
  fewer_hints: 0.5,
  abandoned: -0.6,
  hint_after: -0.2,
}

export async function linkOutcome(event, userId = null, { pool = null } = {}) {
  if (!event?.type) return null

  const store = getExperienceStore(pool)
  const engine = getLearningEngine(pool)
  let signalType = null
  let implicitScore = 0
  const signalJson = { eventType: event.type, payload: event.payload || {} }

  switch (event.type) {
    case 'module_complete':
      signalType = 'module_complete'
      implicitScore = SIGNAL_SCORES.module_complete
      if (event.completedAt && event.startedAt) {
        const hours = (new Date(event.completedAt) - new Date(event.startedAt)) / 3600000
        if (hours <= MODULE_COMPLETE_HOURS) implicitScore += 0.1
        signalJson.completionHours = hours
      }
      break
    case 'verify':
      if (event.payload?.passed || event.payload?.ok) {
        signalType = 'verify_pass'
        implicitScore = SIGNAL_SCORES.verify_pass
      }
      break
    case 'session_step':
    case 'next':
      signalType = 'session_continued'
      implicitScore = SIGNAL_SCORES.session_continued
      break
    case 'hint':
      signalType = 'hint_after'
      implicitScore = SIGNAL_SCORES.hint_after
      break
    case 'abandon':
    case 'session_end':
      if (event.payload?.abandoned) {
        signalType = 'abandoned'
        implicitScore = SIGNAL_SCORES.abandoned
      }
      break
    default:
      return null
  }

  const typesToLink = ['coach', 'hint', 'reflect']
  const recent = recentInteractions(userId).filter(i => typesToLink.includes(i.type))
  if (!recent.length) return null

  const target = recent.find(i =>
    i.skill_id === event.skillId && i.module_id === event.moduleId
  ) || recent[0]

  const result = await store.logReaction({
    interactionId: target.id,
    userId,
    reaction: implicitScore > 0 ? 'helpful' : implicitScore < 0 ? 'not_helpful' : 'neutral',
    implicitScore,
    signalJson: { ...signalJson, signalType, linkedInteraction: target.id },
  })

  await engine.maybeConsolidateAfterReaction()
  return { interactionId: target.id, implicitScore, signalType, ...result }
}

export async function scoreFewerHints(userId, { before, after, pool = null } = {}) {
  if (typeof before !== 'number' || typeof after !== 'number' || after >= before) return null
  const store = getExperienceStore(pool)
  const recent = recentInteractions(userId, 'hint')
  if (!recent[0]) return null
  return store.logReaction({
    interactionId: recent[0].id,
    userId,
    reaction: 'helpful',
    implicitScore: SIGNAL_SCORES.fewer_hints,
    signalJson: { signalType: 'fewer_hints', hintsBefore: before, hintsAfter: after },
  })
}
