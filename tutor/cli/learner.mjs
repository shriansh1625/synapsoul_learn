import { loadProgress } from './engine.mjs'
import { getLocalLearner } from '../lib/learning/LocalLearner.js'
import { readLearnerMeta } from '../lib/learning/learnerStore.js'
import { pushLearnerDigest } from './cloud.mjs'
import { isCliLoggedIn } from './cloud.mjs'

export const AUTO_CONSOLIDATE_EVERY = 15

const LEARNER_COMMANDS = new Set([
  'start', 'next', 'decide', 'hint', 'report', 'sync', 'status',
])

export function shouldCliLearnerObserve(command, result) {
  if (!isCliLoggedIn()) return false
  if (command === 'status') {
    try {
      const session = loadProgress()?.session
      return Boolean(session?.skillId && session?.moduleId)
    } catch {
      return false
    }
  }
  if (!LEARNER_COMMANDS.has(command)) return false
  if (command === 'sync') {
    return result?.status === 'synced' || result?.status === 'sync_partial' || result?.cloud?.ok === true
  }
  return true
}

export function observeSessionStart(source = 'cli') {
  try {
    const progress = loadProgress()
    const learner = getLocalLearner()
    learner.observe({
      type: 'session_start',
      command: source === 'cli' ? 'login' : source,
      progress,
    })
    maybeAutoConsolidate()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function maybeAutoConsolidate() {
  try {
    const m = readLearnerMeta()
    if (m.observeCount > 0 && m.observeCount % AUTO_CONSOLIDATE_EVERY === 0) {
      const learner = getLocalLearner()
      learner.consolidate({ force: true })
        .then(() => pushLearnerDigest(learner.buildSyncDigest()).catch(() => {}))
        .catch(() => {})
    }
  } catch {
    /* ignore */
  }
}

export function observeAfterCli(command, result, sessionBefore) {
  try {
    const progress = loadProgress()
    const learner = getLocalLearner()
    const out = learner.observe({
      type: 'cli_command',
      command,
      result,
      sessionBefore,
      progress,
      brain: result?.brain,
      graph: result?.graph || result?.brain?.graph,
    })
    maybeAutoConsolidate()
    return out
  } catch {
    return { ok: false }
  }
}

export async function observeAfterSync() {
  try {
    const learner = getLocalLearner()
    const digest = learner.buildSyncDigest()
    const cloud = await pushLearnerDigest(digest).catch(() => ({ ok: false }))
    return { digest, cloud }
  } catch {
    return { ok: false }
  }
}

export async function cmdLearnStatus({ json }) {
  const learner = getLocalLearner()
  const status = await learner.status()
  const result = { status: 'local_learner', ...status }
  if (json) return result
  const ollama = status.ollama?.configured
    ? (status.ollama.reachable ? `Ollama ${status.ollama.model} reachable` : 'Ollama configured but not reachable')
    : 'Ollama not configured (optional)'
  return `SynapSoul Local Learner: ${status.chunk_count} chunks, ${status.teaching_rules} rules. ${ollama}. Data: ${status.local_dir}`
}

export async function cmdLearnConsolidate({ json }) {
  const learner = getLocalLearner()
  const progress = loadProgress()
  learner.observe({ type: 'consolidate', command: 'learn consolidate', progress })
  const out = await learner.consolidate({ force: true })
  const digest = learner.buildSyncDigest()
  await pushLearnerDigest(digest).catch(() => {})
  const result = {
    status: 'consolidated',
    source: out.source,
    rules: out.rules,
    digest_synced: true,
  }
  if (json) return result
  return `Consolidated ${out.rules.length} teaching rules (${out.source}).`
}
