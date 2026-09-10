import { loadProgress } from './engine.mjs'
import { getLocalLearner } from '../lib/learning/LocalLearner.js'
import { readLearnerMeta } from '../lib/learning/learnerStore.js'
import { pushLearnerDigest } from './cloud.mjs'

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
    const m = readLearnerMeta()
    if (m.observeCount > 0 && m.observeCount % 25 === 0) {
      learner.consolidate({ force: true }).catch(() => {})
    }
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
