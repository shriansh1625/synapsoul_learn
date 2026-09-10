/**
 * Structured student model. Incremental updates — not a free-text blob.
 */

export function emptyMemory() {
  return {
    strengths: [],
    struggles: [],
    hintDependency: 0,
    preferredPace: 'steady',
    preferredTrack: 'node',
    lastErrors: [],
    decisionPatterns: {
      A: 0,
      B: 0,
      avgReasoningLen: 0,
      reasoningSamples: 0,
      tradeoffHits: 0,
      codeJumpHits: 0,
      totalDecides: 0,
    },
    conceptsMastered: [],
    effectiveLevel: 'beginner',
    confidence: 'medium',
  }
}

export function createState(overrides = {}) {
  return {
    version: 2,
    updatedAt: null,
    eventCount: 0,
    processedEvidence: [],
    skills: {},
    modules: {},
    concepts: {},
    graph: { version: 1, extraEdges: [], ledger: [] },
    ledger: [],
    memory: emptyMemory(),
    signals: [],
    ...overrides,
  }
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state || createState()))
}

function ema(prev, next, alpha = 0.3) {
  if (typeof prev !== 'number') return next
  return prev * (1 - alpha) + next * alpha
}

export function pushSignal(state, signal) {
  const entry = {
    at: new Date().toISOString(),
    ...signal,
  }
  const signals = [entry, ...(state.signals || [])].slice(0, 24)
  return { ...state, signals }
}

export function rememberError(state, error) {
  const lastErrors = [
    { at: new Date().toISOString(), ...error },
    ...(state.memory.lastErrors || []),
  ].slice(0, 8)
  return {
    ...state,
    memory: { ...state.memory, lastErrors },
  }
}

export function updateDecisionPattern(state, choice, reasoning) {
  const dp = { ...state.memory.decisionPatterns }
  if (choice === 'A' || choice === 'B') dp[choice] = (dp[choice] || 0) + 1
  const text = (reasoning || '').trim()
  const len = text.length
  dp.totalDecides = (dp.totalDecides || 0) + 1
  if (len) {
    const n = (dp.reasoningSamples || 0) + 1
    dp.avgReasoningLen = Math.round(((dp.avgReasoningLen || 0) * (n - 1) + len) / n)
    dp.reasoningSamples = n
  }
  if (/\b(trade-?off|versus|vs\.?|latency|throughput|cost|risk|instead|because|constraint|if we|rather than)\b/i.test(text)) {
    dp.tradeoffHits = (dp.tradeoffHits || 0) + 1
  }
  if (/\b(just (code|implement|write)|i'?ll (code|implement)|start coding|ship it|write the|jump to code)\b/i.test(text) || (len > 0 && len < 40)) {
    dp.codeJumpHits = (dp.codeJumpHits || 0) + 1
  }
  return { ...state, memory: { ...state.memory, decisionPatterns: dp } }
}

export function refreshDerivedMemory(state, curriculum) {
  const skillRows = (curriculum?.skills || []).map(skill => {
    const bkt = state.skills[skill.id]
    return {
      id: skill.id,
      title: skill.title,
      pKnow: bkt?.pKnow ?? 0.2,
      observations: bkt?.observations || 0,
    }
  })

  const strengths = skillRows
    .filter(s => s.pKnow >= 0.65 && s.observations > 0)
    .sort((a, b) => b.pKnow - a.pKnow)
    .slice(0, 4)
    .map(s => ({ id: s.id, title: s.title, pKnow: round2(s.pKnow) }))

  const struggles = skillRows
    .filter(s => s.observations >= 1 && s.pKnow < 0.45)
    .sort((a, b) => a.pKnow - b.pKnow)
    .slice(0, 4)
    .map(s => ({ id: s.id, title: s.title, pKnow: round2(s.pKnow) }))

  let hintEvents = 0
  let graded = 0
  for (const mod of Object.values(state.modules || {})) {
    hintEvents += mod.hints || 0
    graded += (mod.completions || 0) + (mod.hints || 0)
  }
  const hintRate = graded ? hintEvents / graded : 0
  const hintDependency = round2(ema(state.memory.hintDependency, hintRate, 0.35))

  let preferredPace = 'steady'
  if (hintDependency >= 0.45) preferredPace = 'slow'
  else if (hintDependency < 0.15 && (state.eventCount || 0) >= 6) preferredPace = 'fast'

  return {
    ...state,
    memory: {
      ...state.memory,
      strengths,
      struggles,
      hintDependency,
      preferredPace,
    },
  }
}

export function markProcessed(state, key) {
  if (!key) return state
  if (state.processedEvidence.includes(key)) return state
  const processedEvidence = [...state.processedEvidence, key].slice(-400)
  return { ...state, processedEvidence }
}

export function hasProcessed(state, key) {
  return !!key && state.processedEvidence.includes(key)
}

export function round2(n) {
  return Math.round(n * 100) / 100
}

export function mergeStates(a, b) {
  if (!a) return cloneState(b)
  if (!b) return cloneState(a)
  const aTime = new Date(a.updatedAt || 0).getTime()
  const bTime = new Date(b.updatedAt || 0).getTime()
  const newer = (b.eventCount || 0) !== (a.eventCount || 0)
    ? ((b.eventCount || 0) > (a.eventCount || 0) ? b : a)
    : (bTime >= aTime ? b : a)
  return cloneState(newer)
}
