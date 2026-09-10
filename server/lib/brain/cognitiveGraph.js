/**
 * SynapSoul Cognitive Graph
 *
 * A living graph of how THIS student thinks, updated from legitimate
 * SynapSoul signals (CLI steps, DECIDE, VERIFY, BREAK, hints, scores).
 *
 * Algorithms we actually run:
 *  1. Bayesian Knowledge Tracing per concept — Corbett & Anderson, 1994
 *  2. SM-2 spaced reviews on modules — Wozniak / SuperMemo 2
 *  3. Knowledge graph: concept + module nodes; prerequisite, co-practice, hint-transfer edges
 *  4. PageRank gap centrality — Page et al., 1999; which weak concepts block the most future work
 *  5. Zone of proximal development frontier — Vygotsky; operationalized as p(know) ≈ 0.45 with ready prereqs
 *  6. Decision-style fingerprint from DECIDE choice, reasoning length, tradeoff vs jump-to-code
 *  7. Evidence ledger: each DECIDE / VERIFY / BREAK maps onto a graph edge recruiters can inspect
 *
 * We do not claim Deep Knowledge Tracing (Piech et al., 2015), Attentive KT (Ghosh et al., 2020),
 * FSRS parameter fitting (Ye, 2022+), IRT/Rasch calibration, or a trained foundation model.
 */

import { createBkt, updateBkt } from './bkt.js'
import { getModule, getSkill, prereqKeys } from './graph.js'
import { round2 } from './memory.js'

const TRADEOFF_RE = /\b(trade-?off|versus|vs\.?|latency|throughput|cost|risk|instead|because|constraint|if we|rather than)\b/i
const JUMP_CODE_RE = /\b(just (code|implement|write)|i'?ll (code|implement)|start coding|ship it|write the|jump to code)\b/i

export const GRAPH_ALGORITHMS = [
  { id: 'bkt', name: 'Bayesian Knowledge Tracing', cite: 'Corbett & Anderson, 1994', applies: 'per concept' },
  { id: 'sm2', name: 'SM-2 spaced review', cite: 'Wozniak / SuperMemo 2', applies: 'per module' },
  { id: 'kg', name: 'Curriculum knowledge graph', cite: 'prerequisite + co-practice + hint-transfer', applies: 'concepts and modules' },
  { id: 'pagerank', name: 'PageRank gap centrality', cite: 'Page et al., 1999', applies: 'which gaps block future modules' },
  { id: 'zpd', name: 'Zone of proximal development', cite: 'Vygotsky; p(know) ≈ 0.45', applies: 'recommended frontier' },
  { id: 'fingerprint', name: 'Decision-style fingerprint', cite: 'DECIDE traces', applies: 'how this student reasons' },
  { id: 'ledger', name: 'Evidence ledger', cite: 'DECIDE / VERIFY / BREAK → edges', applies: 'hiring inspectability' },
]

export function emptyGraphState() {
  return {
    version: 1,
    extraEdges: [],
    ledger: [],
  }
}

export function slugConcept(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'concept'
}

export function titleConcept(id) {
  return String(id || '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function conceptRecord(state, id, title) {
  const existing = state.concepts?.[id]
  if (existing) return existing
  return {
    id,
    title: title || titleConcept(id),
    bkt: createBkt(),
    lastEvidence: null,
    lastAt: null,
    lastKind: null,
  }
}

export function moduleConcepts(curriculum, skillId, moduleId) {
  const mod = getModule(curriculum, skillId, moduleId)
  return (mod?.concepts || []).map(c => ({
    id: slugConcept(c),
    title: titleConcept(slugConcept(c)),
    raw: c,
  }))
}

export function applyConceptEvidence(state, curriculum, skillId, moduleId, correct, kind = 'observe') {
  const concepts = moduleConcepts(curriculum, skillId, moduleId)
  if (!concepts.length) return state
  const next = { ...(state.concepts || {}) }
  const at = new Date().toISOString()
  for (const c of concepts) {
    const rec = { ...conceptRecord(state, c.id, c.title) }
    rec.bkt = updateBkt(rec.bkt, correct)
    rec.lastEvidence = correct ? 'success' : 'slip'
    rec.lastKind = kind
    rec.lastAt = at
    rec.title = c.title
    next[c.id] = rec
  }
  return { ...state, concepts: next }
}

function pushLedger(state, entry) {
  const ledger = [{ at: new Date().toISOString(), ...entry }, ...(state.graph?.ledger || state.ledger || [])].slice(0, 80)
  return {
    ...state,
    graph: { ...(state.graph || emptyGraphState()), ledger },
    ledger,
  }
}

function pushExtraEdge(state, edge) {
  const extra = [...(state.graph?.extraEdges || []), { weight: 1, at: new Date().toISOString(), ...edge }].slice(-120)
  return { ...state, graph: { ...(state.graph || emptyGraphState()), extraEdges: extra } }
}

/**
 * Record a student-specific graph event. Call after module/skill BKT updates.
 */
export function applyGraphEvent(state, curriculum, event = {}) {
  const type = event.type
  const skillId = event.skillId
  const moduleId = event.moduleId
  const payload = event.payload || {}
  const concepts = moduleConcepts(curriculum, skillId, moduleId)
  const moduleKey = skillId && moduleId ? `mod:${skillId}:${moduleId}` : null
  let next = {
    ...state,
    graph: { ...emptyGraphState(), ...(state.graph || {}) },
  }

  if (type === 'hint' || type === 'hint_used') {
    const nxt = nextModule(curriculum, skillId, moduleId)
    if (moduleKey && nxt) {
      const toKey = `mod:${nxt.skillId}:${nxt.id}`
      next = pushExtraEdge(next, {
        from: moduleKey,
        to: toKey,
        kind: 'hint-transfer',
        label: 'Hint on this module transferred pressure to the next one',
      })
      for (const c of concepts) {
        for (const t of nxt.concepts || []) {
          next = pushExtraEdge(next, {
            from: `c:${c.id}`,
            to: `c:${slugConcept(t)}`,
            kind: 'hint-transfer',
            label: 'Hint transfer between related concepts',
          })
        }
      }
    }
    if (moduleKey) {
      next = pushLedger(next, {
        type: 'HINT',
        from: moduleKey,
        to: concepts[0] ? `c:${concepts[0].id}` : moduleKey,
        kind: 'hint-transfer',
        pKnow: next.modules?.[`${skillId}:${moduleId}`]?.bkt?.pKnow ?? null,
        label: `Hint on ${moduleTitle(curriculum, skillId, moduleId)}`,
      })
    }
    return next
  }

  if (type === 'decide') {
    next = pushLedger(next, {
      type: 'DECIDE',
      from: moduleKey,
      to: concepts[0] ? `c:${concepts[0].id}` : moduleKey,
      kind: 'decide',
      choice: payload.choice || null,
      reasoningLen: (payload.reasoning || '').trim().length,
      pKnow: next.modules?.[`${skillId}:${moduleId}`]?.bkt?.pKnow ?? null,
      label: `DECIDE ${payload.choice || '?'} · ${(payload.reasoning || '').trim().slice(0, 80)}`,
    })
    return next
  }

  if (type === 'verify') {
    const passed = payload.passed !== false && payload.passed !== 0
    next = pushLedger(next, {
      type: 'VERIFY',
      from: moduleKey,
      to: concepts[0] ? `c:${concepts[0].id}` : moduleKey,
      kind: passed ? 'verify-pass' : 'verify-miss',
      pKnow: next.modules?.[`${skillId}:${moduleId}`]?.bkt?.pKnow ?? null,
      label: passed
        ? `VERIFY passed · ${moduleTitle(curriculum, skillId, moduleId)}`
        : `VERIFY miss · ${moduleTitle(curriculum, skillId, moduleId)}`,
    })
    return next
  }

  const step = payload.step
  if (type === 'session_step' && step === 'BREAK') {
    next = pushLedger(next, {
      type: 'BREAK',
      from: moduleKey,
      to: concepts[0] ? `c:${concepts[0].id}` : moduleKey,
      kind: 'break-probe',
      pKnow: next.modules?.[`${skillId}:${moduleId}`]?.bkt?.pKnow ?? null,
      label: `BREAK · ${moduleTitle(curriculum, skillId, moduleId)}`,
    })
    return next
  }

  if (type === 'score' || type === 'module_complete') {
    next = pushLedger(next, {
      type: 'VERIFY',
      from: moduleKey,
      to: concepts[0] ? `c:${concepts[0].id}` : moduleKey,
      kind: 'module-score',
      pKnow: next.modules?.[`${skillId}:${moduleId}`]?.bkt?.pKnow ?? null,
      label: `${moduleTitle(curriculum, skillId, moduleId)} scored ${payload.score ?? payload.overall ?? 'n/a'}`,
    })
  }

  return next
}

function moduleTitle(curriculum, skillId, moduleId) {
  return getModule(curriculum, skillId, moduleId)?.title || moduleId || 'module'
}

function nextModule(curriculum, skillId, moduleId) {
  const skill = getSkill(curriculum, skillId)
  if (!skill) return null
  const idx = skill.modules.findIndex(m => m.id === moduleId)
  if (idx < 0 || idx + 1 >= skill.modules.length) return null
  const n = skill.modules[idx + 1]
  return { ...n, skillId }
}

/**
 * Power-iteration PageRank. Incoming links raise rank.
 * Dangling nodes redistribute via the teleport vector.
 */
export function pageRank(nodeIds, edges, { damping = 0.85, iterations = 28, personalize = null } = {}) {
  const n = nodeIds.length
  if (!n) return {}
  const index = Object.fromEntries(nodeIds.map((id, i) => [id, i]))
  const outbound = Array.from({ length: n }, () => [])
  const outWeight = new Float64Array(n)

  for (const e of edges) {
    const i = index[e.from]
    const j = index[e.to]
    if (i == null || j == null || i === j) continue
    const w = Number(e.weight) > 0 ? Number(e.weight) : 1
    outbound[i].push([j, w])
    outWeight[i] += w
  }

  const teleport = new Float64Array(n)
  if (personalize?.length) {
    const mass = personalize.filter(id => index[id] != null)
    const p = 1 / Math.max(mass.length, 1)
    for (const id of mass) teleport[index[id]] = p
    if (!mass.length) teleport.fill(1 / n)
  } else {
    teleport.fill(1 / n)
  }

  let rank = new Float64Array(n).fill(1 / n)
  for (let it = 0; it < iterations; it++) {
    const next = new Float64Array(n)
    for (let i = 0; i < n; i++) next[i] += (1 - damping) * teleport[i]
    for (let i = 0; i < n; i++) {
      if (!outWeight[i]) {
        for (let j = 0; j < n; j++) next[j] += damping * rank[i] * teleport[j]
        continue
      }
      for (const [j, w] of outbound[i]) {
        next[j] += damping * rank[i] * (w / outWeight[i])
      }
    }
    rank = next
  }

  const out = {}
  nodeIds.forEach((id, i) => { out[id] = rank[i] })
  return out
}

export function decisionFingerprint(state) {
  const dp = state.memory?.decisionPatterns || {}
  const a = dp.A || 0
  const b = dp.B || 0
  const total = a + b
  const samples = dp.reasoningSamples || 0
  const avgLen = dp.avgReasoningLen || 0
  const tradeoffHits = dp.tradeoffHits || 0
  const codeJumpHits = dp.codeJumpHits || 0
  const decideN = dp.totalDecides || total || samples

  let style = 'unscored'
  if (decideN >= 1) {
    const tradeoffRate = decideN ? tradeoffHits / decideN : 0
    const jumpRate = decideN ? codeJumpHits / decideN : 0
    if (tradeoffRate >= 0.45 && avgLen >= 70) style = 'tradeoff-first'
    else if (jumpRate >= 0.45 || (avgLen > 0 && avgLen < 40)) style = 'code-first'
    else if (avgLen >= 90) style = 'evidence-seeking'
    else style = 'balanced'
  }

  const aShare = total ? round2(a / total) : null
  const summary = fingerprintSummary({ style, a, b, avgLen, samples, decideN })

  return {
    style,
    summary,
    choiceA: a,
    choiceB: b,
    aShare,
    avgReasoningLen: avgLen,
    reasoningSamples: samples,
    tradeoffHits,
    codeJumpHits,
    decideN,
  }
}

function fingerprintSummary({ style, a, b, avgLen, samples, decideN }) {
  if (!decideN) {
    return 'No DECIDE traces yet — style fingerprints from A/B choices and reasoning length, not from XP.'
  }
  const choice = a === b ? 'even A/B split' : a > b ? `leans A (${a}/${a + b})` : `leans B (${b}/${a + b})`
  const len = samples ? `${avgLen}-character average reasoning` : 'short or missing reasoning'
  if (style === 'tradeoff-first') {
    return `Tradeoff-first: ${choice}, ${len}. They write the tension before they pick.`
  }
  if (style === 'code-first') {
    return `Code-first: ${choice}, ${len}. They move toward an implementation sketch quickly.`
  }
  if (style === 'evidence-seeking') {
    return `Evidence-seeking: ${choice}, ${len}. They argue from constraints before committing.`
  }
  return `Balanced DECIDE style: ${choice}, ${len}.`
}

export function scoreDecisionReasoning(reasoning = '') {
  const text = String(reasoning || '').trim()
  return {
    length: text.length,
    tradeoff: TRADEOFF_RE.test(text),
    jumpToCode: JUMP_CODE_RE.test(text) || (text.length > 0 && text.length < 40),
  }
}

function buildStaticGraph(curriculum) {
  const nodes = []
  const edges = []
  const conceptFirst = {}
  const downstream = {}

  for (const skill of curriculum.skills || []) {
    skill.modules.forEach((mod, mi) => {
      const moduleKey = `mod:${skill.id}:${mod.id}`
      nodes.push({
        id: moduleKey,
        kind: 'module',
        skillId: skill.id,
        moduleId: mod.id,
        title: mod.title,
        skillTitle: skill.title,
        pack: mod.pack || 'launchpad',
        lane: skill.id,
        order: mi,
      })
      const concepts = (mod.concepts || []).map(c => slugConcept(c))
      concepts.forEach((cid, ci) => {
        if (!conceptFirst[cid]) {
          conceptFirst[cid] = { skillId: skill.id, moduleId: mod.id, title: titleConcept(cid) }
          nodes.push({
            id: `c:${cid}`,
            kind: 'concept',
            conceptId: cid,
            title: titleConcept(cid),
            skillId: skill.id,
            moduleId: mod.id,
            skillTitle: skill.title,
            lane: skill.id,
            order: mi + 0.2 + ci * 0.05,
          })
        }
        edges.push({
          from: moduleKey,
          to: `c:${cid}`,
          kind: 'co-practice',
          weight: 1,
        })
      })
      for (let i = 0; i < concepts.length; i++) {
        for (let j = i + 1; j < concepts.length; j++) {
          edges.push({ from: `c:${concepts[i]}`, to: `c:${concepts[j]}`, kind: 'co-practice', weight: 0.6 })
          edges.push({ from: `c:${concepts[j]}`, to: `c:${concepts[i]}`, kind: 'co-practice', weight: 0.6 })
        }
      }
      const prereqs = prereqKeys(curriculum, skill.id, mod.id)
      for (const key of prereqs) {
        const [ps, pm] = key.split(':')
        const fromKey = `mod:${ps}:${pm}`
        edges.push({ from: fromKey, to: moduleKey, kind: 'prerequisite', weight: 1.4 })
        const preMod = getModule(curriculum, ps, pm)
        for (const pc of preMod?.concepts || []) {
          for (const cc of mod.concepts || []) {
            edges.push({
              from: `c:${slugConcept(pc)}`,
              to: `c:${slugConcept(cc)}`,
              kind: 'prerequisite',
              weight: 1.2,
            })
          }
        }
        bumpDownstream(downstream, fromKey, 1)
        for (const pc of preMod?.concepts || []) {
          bumpDownstream(downstream, `c:${slugConcept(pc)}`, 1)
        }
      }
    })
  }

  return { nodes, edges, downstream }
}

function bumpDownstream(map, id, n) {
  map[id] = (map[id] || 0) + n
}

function pKnowOf(state, node) {
  if (node.kind === 'module') {
    const rec = state.modules?.[`${node.skillId}:${node.moduleId}`]
    if (rec?.bkt?.pKnow != null) return rec.bkt.pKnow
    return state.skills?.[node.skillId]?.pKnow ?? 0.2
  }
  const rec = state.concepts?.[node.conceptId]
  return rec?.bkt?.pKnow ?? 0.2
}

function lastEvidenceOf(state, node) {
  if (node.kind === 'module') {
    const rec = state.modules?.[`${node.skillId}:${node.moduleId}`]
    if (!rec) return null
    if (rec.lastScore != null) return `score ${rec.lastScore}`
    if (rec.hints) return `${rec.hints} hint${rec.hints === 1 ? '' : 's'}`
    if (rec.completions) return 'completed'
    return null
  }
  const rec = state.concepts?.[node.conceptId]
  if (!rec?.lastKind) return null
  return `${rec.lastKind} · ${rec.lastEvidence || ''}`.trim()
}

/**
 * Build the recruiter- and dashboard-facing graph snapshot.
 */
export function buildGraphSnapshot(state, curriculum, recommendResult = {}) {
  const staticG = buildStaticGraph(curriculum)
  const extra = state.graph?.extraEdges || []
  const displayEdges = [...staticG.edges, ...extra.map(e => ({
    from: e.from,
    to: e.to,
    kind: e.kind || 'hint-transfer',
    weight: e.weight || 1,
    student: true,
  }))]

  const nodeIds = staticG.nodes.map(n => n.id)
  // Rank foundations: reverse prerequisite so early concepts collect inbound votes.
  const rankEdges = displayEdges.map(e => (
    e.kind === 'prerequisite' ? { from: e.to, to: e.from, weight: e.weight } : e
  ))
  const rec = recommendResult.recommendedNext
  const personalize = rec ? [`mod:${rec.skillId}:${rec.moduleId}`] : null
  const ranks = pageRank(nodeIds, rankEdges, { personalize })

  const nodes = staticG.nodes.map(n => {
    const pKnow = pKnowOf(state, n)
    const rank = ranks[n.id] || 0
    const down = staticG.downstream[n.id] || 0
    const gap = 1 - pKnow
    const blocker = rank * gap * (1 + Math.log1p(down))
    const zpd = 1 - Math.abs(pKnow - 0.45)
    const lastEvidence = lastEvidenceOf(state, n)
    const recMatch = rec && n.kind === 'module' && n.skillId === rec.skillId && n.moduleId === rec.moduleId
    return {
      ...n,
      pKnow: round2(pKnow),
      rank: round2(rank * 1000) / 1000,
      downstream: down,
      blocker: round2(blocker),
      zpd: round2(zpd),
      lastEvidence,
      lastAt: n.kind === 'concept' ? (state.concepts?.[n.conceptId]?.lastAt || null) : (state.modules?.[`${n.skillId}:${n.moduleId}`] ? state.updatedAt : null),
      frontier: false,
      recommended: !!recMatch,
    }
  })

  const blockers = [...nodes]
    .filter(n => n.kind === 'concept')
    .sort((a, b) => b.blocker - a.blocker)
    .slice(0, 5)
    .map(n => ({
      id: n.id,
      title: n.title,
      skillTitle: n.skillTitle,
      pKnow: n.pKnow,
      rank: n.rank,
      downstream: n.downstream,
      why: n.pKnow < 0.45 && n.downstream
        ? `${n.title} is still weak (p(know)=${n.pKnow}) and ${n.downstream} later module${n.downstream === 1 ? '' : 's'} depend on it`
        : `${n.title} is central in the curriculum graph (PageRank ${n.rank})`,
    }))

  const frontierIds = new Set()
  if (rec) frontierIds.add(`mod:${rec.skillId}:${rec.moduleId}`)
  for (const c of recommendResult.candidates || []) {
    if (c.unlocked && (!c.completed || c.due)) {
      frontierIds.add(`mod:${c.skillId}:${c.moduleId}`)
    }
  }
  const conceptFrontier = nodes
    .filter(n => n.kind === 'concept' && n.pKnow >= 0.28 && n.pKnow <= 0.62)
    .sort((a, b) => b.zpd - a.zpd)
    .slice(0, 4)
  for (const n of conceptFrontier) frontierIds.add(n.id)

  for (const n of nodes) {
    n.frontier = frontierIds.has(n.id)
  }

  const frontier = nodes
    .filter(n => n.frontier)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.zpd - a.zpd)
    .slice(0, 8)
    .map(n => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      skillTitle: n.skillTitle,
      pKnow: n.pKnow,
      zpd: n.zpd,
      recommended: n.recommended,
      why: n.recommended
        ? (recommendResult.why || 'In the productive-struggle band with ready prerequisites')
        : `p(know)=${n.pKnow} sits in the zone of proximal development`,
    }))

  const fingerprint = decisionFingerprint(state)
  const ledger = (state.graph?.ledger || state.ledger || []).slice(0, 16)
  const hiring = heuristicHiringSentences({ fingerprint, frontier, blockers, nodes, eventCount: state.eventCount || 0 })

  return {
    version: 1,
    updatedAt: state.updatedAt,
    eventCount: state.eventCount || 0,
    claim: 'The tutor does not just track XP. It maps how you reason.',
    algorithms: GRAPH_ALGORITHMS,
    nodes,
    edges: displayEdges,
    frontier,
    blockers,
    fingerprint,
    hiring,
    ledger,
    why: recommendResult.why || null,
    recommendedNext: rec || null,
  }
}

export function heuristicHiringSentences({ fingerprint, frontier, blockers, nodes, eventCount } = {}) {
  const sentences = []
  const fp = fingerprint || decisionFingerprint({})
  const rec = frontier?.find(f => f.recommended) || frontier?.[0]
  const top = [...(nodes || [])]
    .filter(n => n.kind === 'concept')
    .sort((a, b) => b.pKnow - a.pKnow)[0]
  const blocker = blockers?.[0]

  sentences.push(fp.summary)

  if ((eventCount || 0) === 0) {
    sentences.push('Priors start at p(know)=0.2. The graph fills from DECIDE, VERIFY, BREAK, and scored modules — never from invented activity.')
    sentences.push(rec
      ? `The current frontier is ${rec.title}${rec.skillTitle ? ` in ${rec.skillTitle}` : ''} — the productive-struggle zone before any XP is on the board.`
      : 'The frontier is the first Launchpad module: close enough to be reachable, far enough to require a real decision.')
  } else {
    if (top && top.pKnow >= 0.45) {
      sentences.push(`Strongest concept signal: ${top.title} at p(know)=${top.pKnow}, updated from this student’s own VERIFY and module evidence.`)
    } else if (top) {
      sentences.push(`Early signal on ${top.title} (p(know)=${top.pKnow}). Mastery is Bayesian — a handful of observations, not a certificate bar.`)
    } else {
      sentences.push('Concept-level BKT is live; complete a module so recruiters can inspect which ideas actually moved.')
    }

    if (blocker && rec) {
      sentences.push(`Next productive struggle: ${rec.title}. ${blocker.title} still gates later work (${blocker.why}).`)
    } else if (rec) {
      sentences.push(`Recommended frontier: ${rec.title} because p(know)=${rec.pKnow} sits in the zone of proximal development.`)
    } else {
      sentences.push('The graph will name a frontier as soon as a module is in the productive-struggle band with ready prerequisites.')
    }
  }

  return {
    sentences: sentences.slice(0, 3),
    source: 'heuristic',
  }
}

export function publicGraphSummary(graph) {
  if (!graph) {
    const hiring = heuristicHiringSentences({ eventCount: 0, frontier: [], blockers: [], nodes: [] })
    return {
      claim: 'The tutor does not just track XP. It maps how you reason.',
      fingerprint: { style: 'unscored', summary: hiring.sentences[0] },
      frontier: [],
      blockers: [],
      hiring_sentences: hiring.sentences,
      hiring_source: 'heuristic',
      eventCount: 0,
      nodes_preview: [],
    }
  }
  const preview = (graph.nodes || [])
    .filter(n => n.frontier || n.recommended || (n.kind === 'concept' && n.blocker > 0))
    .slice(0, 18)
  return {
    claim: graph.claim,
    fingerprint: graph.fingerprint,
    frontier: (graph.frontier || []).slice(0, 5),
    blockers: (graph.blockers || []).slice(0, 4),
    hiring_sentences: graph.hiring?.sentences || heuristicHiringSentences(graph).sentences,
    hiring_source: graph.hiring?.source || 'heuristic',
    eventCount: graph.eventCount || 0,
    nodes_preview: preview,
    why: graph.why,
  }
}

export async function maybeEnrichHiring(graph, { groqComplete, ollamaComplete } = {}) {
  const base = graph.hiring?.sentences || heuristicHiringSentences(graph).sentences
  const prompt = `Write exactly 3 hiring sentences about how this engineering student thinks. Use only the facts. No fluff, no "passionate", no invented metrics.
Fingerprint: ${graph.fingerprint?.summary || ''}
Frontier: ${(graph.frontier || []).map(f => f.title).join(', ') || 'none'}
Blockers: ${(graph.blockers || []).map(b => b.title + ' p=' + b.pKnow).join(', ') || 'none'}
Events: ${graph.eventCount || 0}
Return JSON {"sentences":["...","...","..."]}`

  async function parse(text) {
    const match = String(text || '').match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.sentences) || parsed.sentences.length < 3) return null
    return parsed.sentences.slice(0, 3).map(s => String(s).trim()).filter(Boolean)
  }

  if (typeof groqComplete === 'function') {
    try {
      const text = await groqComplete({
        messages: [
          { role: 'system', content: 'You write terse hiring sentences from a Cognitive Graph. JSON only.' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 220,
        temperature: 0.3,
        json: true,
        timeoutMs: 2500,
      })
      const sentences = await parse(text)
      if (sentences?.length === 3) return { sentences, source: 'groq' }
    } catch { /* heuristic stands */ }
  }

  if (typeof ollamaComplete === 'function') {
    try {
      const text = await ollamaComplete({
        system: 'You write terse hiring sentences from a Cognitive Graph. JSON only. No PII.',
        user: prompt,
        maxTokens: 220,
        timeoutMs: 8000,
      })
      const sentences = await parse(text)
      if (sentences?.length === 3) return { sentences, source: 'ollama' }
    } catch { /* heuristic stands */ }
  }

  return { sentences: base.slice(0, 3), source: graph.hiring?.source || 'heuristic' }
}

export function cliEventToBrain(event = {}) {
  const type = event.type
  const skillId = event.skillId || event.skill_id
  const moduleId = event.moduleId || event.module_id
  const step = event.step
  const payload = event.payload || {}
  if (type === 'hint') return { type: 'hint', skillId, moduleId, payload }
  if (type === 'decide') return { type: 'decide', skillId, moduleId, payload }
  if (type === 'module_complete') return { type: 'module_complete', skillId, moduleId, payload }
  if (type === 'next' || type === 'start') {
    return { type: 'session_step', skillId, moduleId, payload: { ...payload, step: step || payload.step } }
  }
  return { type: type || 'event', skillId, moduleId, payload: { ...payload, step } }
}
