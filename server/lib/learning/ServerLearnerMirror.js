import { pool } from '../../db/pool.js'
import { ollamaComplete, ollamaConfigured } from './ollamaClient.js'

export const AUTO_CONSOLIDATE_EVERY = 15

const CHUNK_KINDS = new Set([
  'cli_command',
  'sync',
  'consolidate',
  'session_start',
  'website_login',
  'profile_update',
  'progress_sync',
  'reaction',
  'brain_observe',
  'progress_event',
  'module_complete',
])

const consolidating = new Set()

function emptyMirror() {
  return {
    observeCount: 0,
    lastObserve: null,
    lastConsolidation: null,
    consolidationSource: null,
    profileDigest: {},
    patterns: { version: 1, teaching_rules: [], signals: {} },
    chunks: [],
  }
}

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

function heuristicRules({ profile, chunks }) {
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

function sanitizeDigest(mirror) {
  const patterns = mirror.patterns || {}
  const profile = mirror.profileDigest || {}
  const rules = Array.isArray(patterns.teaching_rules)
    ? patterns.teaching_rules.map(r => String(r).slice(0, 500)).slice(0, 5)
    : []
  const signals = patterns.signals && typeof patterns.signals === 'object' ? patterns.signals : {}
  return {
    version: 1,
    synced_at: new Date().toISOString(),
    teaching_rules: rules,
    signals: {
      hint_dependency: signals.hint_dependency ?? profile.hint_dependency ?? null,
      pace: signals.pace ?? profile.pace ?? null,
      modules_completed: signals.modules_completed ?? profile.modules_completed ?? null,
      chunk_count: signals.chunk_count ?? (mirror.chunks?.length || 0),
    },
    last_consolidation: mirror.lastConsolidation || null,
    consolidation_source: mirror.consolidationSource || patterns.consolidation_source || null,
  }
}

async function loadMirror(userId) {
  const { rows } = await pool.query('SELECT memory, learner_digest FROM student_memory WHERE user_id = $1', [userId])
  const memory = rows[0]?.memory || {}
  const mirror = { ...emptyMirror(), ...(memory.learnerMirror || {}) }
  if (!Array.isArray(mirror.chunks)) mirror.chunks = []
  return { mirror, memory, existingDigest: rows[0]?.learner_digest || null }
}

async function saveMirror(userId, mirror, memory, digest = null) {
  const nextMemory = { ...memory, learnerMirror: mirror }
  if (digest) {
    await pool.query(
      `INSERT INTO student_memory (user_id, memory, learner_digest) VALUES ($1, $2::jsonb, $3::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET memory = $2::jsonb, learner_digest = $3::jsonb`,
      [userId, JSON.stringify(nextMemory), JSON.stringify(digest)]
    )
  } else {
    await pool.query(
      `INSERT INTO student_memory (user_id, memory) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET memory = $2::jsonb`,
      [userId, JSON.stringify(nextMemory)]
    )
  }
}

export async function mirrorObserve(userId, event = {}, { progress, brainSnapshot } = {}) {
  if (!userId) return { ok: false }
  const { mirror, memory } = await loadMirror(userId)

  mirror.observeCount = (mirror.observeCount || 0) + 1
  mirror.lastObserve = new Date().toISOString()

  const brain = brainSnapshot || event.brain || event.result?.brain || null
  if (progress && typeof progress === 'object') {
    mirror.profileDigest = buildProfileDigest(progress, brain)
  } else if (brain) {
    mirror.profileDigest = buildProfileDigest({}, brain)
  }

  const kind = event.type || 'unknown'
  const session = progress?.session || {}
  const summaryParts = [
    event.command,
    session.skillId,
    session.moduleId,
    session.step,
    event.result?.status,
    event.source,
  ].filter(Boolean)

  const chunk = {
    kind,
    command: event.command || null,
    skill_id: session.skillId || event.skillId || null,
    module_id: session.moduleId || event.moduleId || null,
    step: session.step || event.step || null,
    summary: summaryParts.join(' / ') || kind,
    text: event.text || null,
    tags: mirror.profileDigest?.struggle_tags || [],
    hints_used: session.hintsUsed ?? event.hintsUsed ?? null,
    at: new Date().toISOString(),
  }

  if (CHUNK_KINDS.has(kind) || event.command) {
    mirror.chunks = [...(mirror.chunks || []), chunk].slice(-120)
  }

  const chunks = mirror.chunks || []
  mirror.patterns = {
    version: 1,
    ...(mirror.patterns || {}),
    signals: {
      hint_dependency: mirror.profileDigest?.hint_dependency,
      pace: mirror.profileDigest?.pace,
      modules_completed: mirror.profileDigest?.modules_completed,
      chunk_count: chunks.length,
    },
    updated_at: new Date().toISOString(),
  }
  if (!mirror.patterns.teaching_rules?.length) {
    mirror.patterns.teaching_rules = heuristicRules({
      profile: mirror.profileDigest,
      chunks,
    })
  }

  await saveMirror(userId, mirror, memory)

  if (mirror.observeCount > 0 && mirror.observeCount % AUTO_CONSOLIDATE_EVERY === 0) {
    scheduleMirrorConsolidate(userId)
  }

  return { ok: true }
}

export function mirrorObserveFireAndForget(userId, event, ctx = {}) {
  if (!userId) return
  setImmediate(() => {
    mirrorObserve(userId, event, ctx).catch(() => {})
  })
}

export function scheduleMirrorConsolidate(userId) {
  if (!userId || consolidating.has(userId)) return
  consolidating.add(userId)
  setImmediate(() => {
    mirrorConsolidate(userId)
      .catch(() => {})
      .finally(() => consolidating.delete(userId))
  })
}

export async function mirrorConsolidate(userId) {
  const { mirror, memory } = await loadMirror(userId)
  const profile = mirror.profileDigest || {}
  const chunks = mirror.chunks || []

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
    rules = heuristicRules({ profile, chunks })
    source = 'heuristic'
  }

  mirror.patterns = {
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
  mirror.lastConsolidation = new Date().toISOString()
  mirror.consolidationSource = source
  mirror.chunks = [
    ...chunks,
    {
      kind: 'consolidate',
      summary: `consolidate via ${source}`,
      text: rules.join(' | '),
      at: new Date().toISOString(),
    },
  ].slice(-120)

  const digest = sanitizeDigest(mirror)
  await saveMirror(userId, mirror, memory, digest)
  return { ok: true, digest, source }
}
