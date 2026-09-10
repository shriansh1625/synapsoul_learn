import { readStore } from './localStore.js'
import {
  readLearnerJson,
  writeLearnerJson,
  appendChunk,
  readChunks,
  readLearnerMeta,
  writeLearnerMeta,
  learnerDir,
} from './learnerStore.js'
import { retrieveChunks, formatRetrievedChunks } from './learnerRag.js'
import { ollamaComplete, ollamaConfigured, ollamaReachable, ollamaModel } from './ollamaClient.js'

function completedModuleCount(progress) {
  const cm = progress?.completedModules || {}
  return Object.keys(cm).length
}

function hintDependencyLevel(progress, brain) {
  const hints = progress?.session?.hintsUsed ?? 0
  const pace = brain?.preferredPace || ''
  if (hints >= 4 || pace === 'slow') return 'high'
  if (hints >= 2) return 'medium'
  return 'low'
}

function buildProfileDigest(progress, brainSnapshot) {
  const p = progress?.profile || {}
  const struggles = (brainSnapshot?.struggles || []).slice(0, 5).map(s => s.id || s.title).filter(Boolean)
  return {
    updated_at: new Date().toISOString(),
    track: p.track || brainSnapshot?.preferredTrack || null,
    degree: p.degree || null,
    goals: p.bio ? String(p.bio).slice(0, 280) : null,
    modules_completed: completedModuleCount(progress),
    hint_dependency: hintDependencyLevel(progress, brainSnapshot),
    pace: brainSnapshot?.preferredPace || null,
    struggle_tags: struggles,
    bkt_summary: brainSnapshot?.why || null,
  }
}

function heuristicRules({ profile, chunks, interactions }) {
  const rules = []
  const dep = profile?.hint_dependency
  if (dep === 'high') {
    rules.push('Offer smaller verification steps before broader hints; ask what they tried first.')
  } else if (dep === 'medium') {
    rules.push('Balance nudges with one concrete check they can run in under five minutes.')
  } else {
    rules.push('Keep coaching concise; this learner often progresses with minimal hints.')
  }

  if (profile?.pace === 'slow') {
    rules.push('Prefer one milestone at a time; avoid stacking multiple new concepts in one reply.')
  } else if (profile?.pace === 'fast') {
    rules.push('They move quickly — challenge with tradeoffs and edge cases, not repetition.')
  }

  const struggleTags = profile?.struggle_tags || []
  if (struggleTags.length) {
    rules.push(`Reinforce evidence on: ${struggleTags.slice(0, 3).join(', ')}.`)
  }

  const hintHeavy = chunks.filter(c => c.kind === 'hint').length
  const completes = chunks.filter(c => c.kind === 'module_complete').length
  if (hintHeavy > completes * 2 && hintHeavy > 3) {
    rules.push('Pattern: many hints before completes — prompt self-check questions before the next nudge.')
  }

  const helpful = interactions.filter(i => i.type === 'coach' || i.type === 'hint').slice(-20)
  if (helpful.length >= 5) {
    rules.push('Reuse short, step-tied phrasing that matched past helpful coach/hint responses.')
  }

  while (rules.length < 5) {
    const fillers = [
      'Never paste full BUILD solutions; point to VERIFY criteria instead.',
      'Tie feedback to portfolio evidence when the student mentions output or tests.',
      'Acknowledge streaks or module completes briefly, then one actionable next step.',
    ]
    for (const f of fillers) {
      if (rules.length >= 5) break
      if (!rules.includes(f)) rules.push(f)
    }
    break
  }

  return rules.slice(0, 5)
}

function parseRulesFromOllama(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed.rules)) return parsed.rules.slice(0, 5)
    }
  } catch {
    /* fall through */
  }
  return text
    .split('\n')
    .map(l => l.replace(/^[\d.\-*\s]+/, '').trim())
    .filter(l => l.length > 12)
    .slice(0, 5)
}

export class LocalLearner {
  observe(event = {}) {
    const meta = readLearnerMeta()
    meta.observeCount = (meta.observeCount || 0) + 1
    meta.lastObserve = new Date().toISOString()
    writeLearnerMeta(meta)

    const progress = event.progress || {}
    const brain = event.brain || event.result?.brain || null
    const profileDigest = buildProfileDigest(progress, brain)
    writeLearnerJson('profileDigest', profileDigest)

    if (brain?.graph) {
      writeLearnerJson('graph', brain.graph)
    } else if (event.graph) {
      writeLearnerJson('graph', event.graph)
    }

    const kind = event.type || 'unknown'
    const session = progress?.session || {}
    const summaryParts = [
      event.command,
      session.skillId,
      session.moduleId,
      session.step,
      event.result?.status,
    ].filter(Boolean)

    const chunk = {
      kind,
      command: event.command || null,
      skill_id: session.skillId || event.skillId || null,
      module_id: session.moduleId || event.moduleId || null,
      step: session.step || event.step || null,
      summary: summaryParts.join(' / ') || kind,
      text: event.text || null,
      tags: profileDigest.struggle_tags || [],
      hints_used: session.hintsUsed ?? event.hintsUsed ?? null,
    }

    if (['cli_command', 'sync', 'consolidate'].includes(kind) || event.command) {
      appendChunk(chunk)
    }

    const patterns = readLearnerJson('patterns', { version: 1, teaching_rules: [], signals: {} })
    patterns.signals = {
      hint_dependency: profileDigest.hint_dependency,
      pace: profileDigest.pace,
      modules_completed: profileDigest.modules_completed,
      chunk_count: readChunks(5000).length,
    }
    patterns.updated_at = new Date().toISOString()
    if (!patterns.teaching_rules?.length) {
      patterns.teaching_rules = heuristicRules({
        profile: profileDigest,
        chunks: readChunks(100),
        interactions: readStore('interactions', []),
      })
    }
    writeLearnerJson('patterns', patterns)

    return { ok: true, profileDigest }
  }

  async consolidate({ force = false } = {}) {
    const profile = readLearnerJson('profileDigest', {})
    const chunks = readChunks(120)
    const interactions = readStore('interactions', [])
    const meta = readLearnerMeta()

    let rules = []
    let source = 'heuristic'

    const examples = chunks
      .slice(-25)
      .map((c, i) => `${i + 1}. ${c.summary}${c.text ? `: ${c.text}` : ''}`)
      .join('\n')

    if (ollamaConfigured()) {
      try {
        const system = `You are SynapSoul Local Learner. Distill exactly 5 concise teaching rules for coaching this student in an engineering bootcamp. Rules must be actionable for a tutor. No PII. Return JSON only: {"rules":["rule1","rule2","rule3","rule4","rule5"]}`
        const user = `Profile signals: hint_dependency=${profile.hint_dependency}, pace=${profile.pace}, struggles=${(profile.struggle_tags || []).join(', ')}\n\nRecent activity:\n${examples}`
        const text = await ollamaComplete({ system, user, maxTokens: 450 })
        rules = parseRulesFromOllama(text)
        if (rules.length >= 3) source = 'ollama'
      } catch {
        rules = []
      }
    }

    if (rules.length < 3) {
      rules = heuristicRules({ profile, chunks, interactions })
      source = 'heuristic'
    }

    const patterns = {
      version: 1,
      updated_at: new Date().toISOString(),
      teaching_rules: rules.slice(0, 5),
      signals: {
        hint_dependency: profile.hint_dependency,
        pace: profile.pace,
        modules_completed: profile.modules_completed,
        chunk_count: chunks.length,
      },
      consolidation_source: source,
    }
    writeLearnerJson('patterns', patterns)

    meta.lastConsolidation = new Date().toISOString()
    meta.consolidationSource = source
    writeLearnerMeta(meta)

    appendChunk({
      kind: 'consolidate',
      summary: `consolidate via ${source}`,
      text: rules.join(' | '),
    })

    return { ok: true, rules: patterns.teaching_rules, source }
  }

  getTeachingRules() {
    const patterns = readLearnerJson('patterns', {})
    return patterns.teaching_rules || []
  }

  getContextBlock(context = {}) {
    const rules = this.getTeachingRules()
    const query = [
      context.struggle,
      context.skillId,
      context.moduleId,
      context.step,
      context.moduleTitle,
    ].filter(Boolean).join(' ')
    const retrieved = retrieveChunks(query, {
      skillId: context.skillId,
      moduleId: context.moduleId,
      limit: 3,
    })

    const parts = []
    if (rules.length) {
      parts.push(
        'SynapSoul Local Learner rules (from your CLI + profile activity, not your whole IDE):\n' +
        rules.map((r, i) => `${i + 1}. ${r}`).join('\n')
      )
    }
    const rag = formatRetrievedChunks(retrieved)
    if (rag) parts.push(rag)
    return parts.join('\n\n')
  }

  buildSyncDigest() {
    const patterns = readLearnerJson('patterns', {})
    const profile = readLearnerJson('profileDigest', {})
    const meta = readLearnerMeta()
    return {
      version: 1,
      synced_at: new Date().toISOString(),
      teaching_rules: (patterns.teaching_rules || []).slice(0, 5),
      signals: patterns.signals || {
        hint_dependency: profile.hint_dependency,
        pace: profile.pace,
        modules_completed: profile.modules_completed,
      },
      chunk_count: patterns.signals?.chunk_count ?? readChunks(5000).length,
      last_consolidation: meta.lastConsolidation,
      consolidation_source: meta.consolidationSource || patterns.consolidation_source,
    }
  }

  async status() {
    const meta = readLearnerMeta()
    const patterns = readLearnerJson('patterns', {})
    const profile = readLearnerJson('profileDigest', {})
    const ollama = ollamaConfigured()
    const ollamaOk = ollama ? await ollamaReachable() : false

    return {
      product: 'SynapSoul Local Learner',
      local_dir: learnerDir(),
      observe_count: meta.observeCount || 0,
      chunk_count: readChunks(5000).length,
      teaching_rules: (patterns.teaching_rules || []).length,
      last_observe: meta.lastObserve,
      last_consolidation: meta.lastConsolidation,
      consolidation_source: meta.consolidationSource || patterns.consolidation_source,
      profile_signals: {
        hint_dependency: profile.hint_dependency,
        pace: profile.pace,
        modules_completed: profile.modules_completed,
      },
      ollama: {
        configured: ollama,
        reachable: ollamaOk,
        host: ollama ? process.env.OLLAMA_HOST : null,
        model: ollama ? ollamaModel() : null,
      },
      privacy: 'Learns from SynapSoul CLI, profile, and bootcamp steps — not IDE keylogs or arbitrary files.',
    }
  }
}

let singleton = null

export function getLocalLearner() {
  if (!singleton) singleton = new LocalLearner()
  return singleton
}

/** Format cloud-stored digest for LLM prompts (API / cross-device). */
export function formatLearnerDigestForPrompt(digest) {
  if (!digest || typeof digest !== 'object') return ''
  const rules = digest.teaching_rules || []
  if (!rules.length) return ''
  const sig = digest.signals || {}
  const signalLine = [
    sig.hint_dependency && `hint dependency: ${sig.hint_dependency}`,
    sig.pace && `pace: ${sig.pace}`,
    sig.modules_completed != null && `modules completed: ${sig.modules_completed}`,
  ].filter(Boolean).join(', ')
  const lines = rules.map((r, i) => `${i + 1}. ${r}`)
  return `SynapSoul learning pattern digest (synced from student devices):\n${signalLine ? `Signals: ${signalLine}\n` : ''}${lines.join('\n')}`
}
