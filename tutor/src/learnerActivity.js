import { observeLearner } from './api.js'

let websiteSessionSeeded = false

export function resetLearnerActivitySession() {
  websiteSessionSeeded = false
}

export function seedWebsiteSessionStart(progress) {
  if (websiteSessionSeeded) return
  websiteSessionSeeded = true
  observeLearner({
    type: 'website_login',
    source: 'website',
    progress: progress ? slimProgress(progress) : null,
  })
  observeLearner({
    type: 'session_start',
    source: 'website',
    command: 'login',
    progress: progress ? slimProgress(progress) : null,
  })
}

export function notifyProgressSync(progress) {
  observeLearner({
    type: 'progress_sync',
    source: 'website',
    progress: progress ? slimProgress(progress) : null,
  })
}

export function notifyProfileUpdate(progress) {
  observeLearner({
    type: 'profile_update',
    source: 'website',
    command: 'profile update',
    progress: progress ? slimProgress(progress) : null,
  })
}

export function notifyBrainReaction(reaction) {
  observeLearner({
    type: 'reaction',
    source: 'website',
    text: reaction,
  })
}

export function notifySessionStep(session) {
  if (!session?.skillId) return
  observeLearner({
    type: 'brain_observe',
    source: 'website',
    skillId: session.skillId,
    moduleId: session.moduleId,
    step: session.step,
    progress: { session },
  })
}

function slimProgress(p) {
  return {
    profile: p.profile,
    session: p.session,
    completedModules: p.completedModules,
    scores: p.scores,
    portfolio: p.portfolio,
  }
}
