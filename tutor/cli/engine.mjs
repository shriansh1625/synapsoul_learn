import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'
import readline from 'readline'
import {
  AdaptiveEngine,
  hydrateFromProgress,
  buildCurriculum,
  loadBundledCurriculum,
  maybeEnrichHiring,
} from '../lib/brain/index.js'
import { maybeCoachNote } from '../lib/llm/coachService.js'
import { getLearnLabLLM } from '../lib/llm/LearnLabLLM.js'
import { getExperienceStore } from '../lib/learning/ExperienceStore.js'
import {
  getApiBase,
  resolveSyncApiBase,
  loadSavedToken,
  saveToken,
  loginToApi,
  registerToApi,
  loginWithToken,
  fetchAuthProviders,
  generateCliNonce,
  githubCliStartUrl,
  pollCliAuth,
  websiteRegisterHint,
  pushProgressAndBrain,
  PRODUCTION_API,
  PRODUCTION_SITE,
  openSite,
} from './cloud.mjs'
import {
  dataDir,
  progressFile,
  syncDirPath,
  publicDir,
  feedbackDir,
  CLI_NAME,
} from './paths.mjs'
import { writeLearnerJson } from '../lib/learning/learnerStore.js'
import { ollamaComplete, ollamaConfigured } from '../lib/learning/ollamaClient.js'

const DATA_DIR = dataDir()
const STEPS = ['CONTEXT', 'DECIDE', 'BUILD', 'VERIFY', 'BREAK', 'FIX', 'REFLECT']

const DIMENSIONS = [
  'tradeoff_reasoning',
  'production_thinking',
  'hypothesis_quality',
  'root_cause_depth',
  'task_clarity',
  'adaptation_speed',
  'review_thoroughness',
  'engineering_judgment',
  'failure_thinking',
  'observability_coverage',
  'communication_clarity',
  'writing_clarity',
]

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function progressPath() {
  return progressFile()
}

function defaultProgress() {
  return readJson(join(DATA_DIR, 'progress.template.json'))
}

export function loadProgress() {
  const path = progressPath()
  if (!existsSync(path)) {
    const def = defaultProgress()
    writeJson(path, def)
    return def
  }
  const progress = readJson(path)
  return migrateProgress(progress)
}

function migrateProgress(progress) {
  const migrated = { ...progress }
  const rekey = (obj) => {
    if (!obj) return obj
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      out[k.replace(/^web-fundamentals:/, 'system-design-fundamentals:')] = v
    }
    return out
  }
  migrated.completedModules = rekey(migrated.completedModules)
  migrated.decisions = rekey(migrated.decisions)
  migrated.scores = rekey(migrated.scores)
  if (migrated.session?.skillId === 'web-fundamentals') {
    migrated.session.skillId = 'system-design-fundamentals'
  }
  if (!migrated.profile) migrated.profile = defaultProgress().profile
  migrated.profile_confirmed = migrated.profile?.confirmed ?? false
  migrated.profile_ready = !!(migrated.profile?.name && migrated.profile?.degree && migrated.profile?.bio)
  migrated.public_profile_ready = !!(migrated.profile?.linkedin || migrated.profile?.username)
  return migrated
}

export function computeReadinessScore(progress, catalog) {
  const completed = Object.keys(progress.completedModules || {}).length
  const totalModules = catalog.skills.reduce((n, s) => {
    try { return n + loadSkillManifest(s.id).modules.length } catch { return n + (s.moduleCount || 1) }
  }, 0)
  const completionPct = totalModules ? (completed / totalModules) * 40 : 0

  const scores = Object.values(progress.scores || {})
  let dimAvg = 0
  if (scores.length) {
    const overalls = scores.map(s => s.overall).filter(Boolean)
    dimAvg = overalls.length ? (overalls.reduce((a, b) => a + b, 0) / overalls.length / 5) * 40 : 0
  }

  const portfolioPct = Math.min((progress.portfolio?.length || 0) * 4, 20)

  return Math.round(Math.min(completionPct + dimAvg + portfolioPct, 100))
}

function computeHeadlineDimensions(progress, catalog) {
  const headline = catalog.headlineDimensions || []
  const totals = {}
  const counts = {}
  for (const score of Object.values(progress.scores || {})) {
    for (const dim of headline) {
      const val = score[dim.id] ?? score.dimensions?.[dim.id]?.score ?? score.dimensions?.[dim.id]
      if (typeof val === 'number') {
        totals[dim.id] = (totals[dim.id] || 0) + val
        counts[dim.id] = (counts[dim.id] || 0) + 1
      }
    }
  }
  return headline.map(d => ({
    id: d.id,
    label: d.label,
    score: counts[d.id] ? Math.round((totals[d.id] / counts[d.id]) * 10) / 10 : null,
    max: 5,
  }))
}

function computeBadges(progress, catalog) {
  return catalog.skills.filter(skill => {
    try {
      const manifest = loadSkillManifest(skill.id)
      return manifest.modules.every(m => progress.completedModules[`${skill.id}:${m.id}`])
    } catch { return false }
  }).map(s => ({ id: s.id, title: s.title, earnedAt: new Date().toISOString() }))
}

export function saveProgress(progress) {
  writeJson(progressPath(), progress)
  const apiBase = getApiBase()
  const token = loadSavedToken()
  if (!apiBase || !token) return
  pushProgressAndBrain({
    apiBase,
    token,
    progress,
    brain: progress?.studentMemory?.brain || null,
  }).catch(() => {})
}

export function loadCatalog() {
  return readJson(join(DATA_DIR, 'catalog.json'))
}

export function loadGlossary() {
  return readJson(join(DATA_DIR, 'glossary.json'))
}

export function loadInterludes() {
  return readJson(join(DATA_DIR, 'interludes.json'))
}

export function loadSkillManifest(skillId) {
  const path = join(DATA_DIR, 'skills', skillId, 'manifest.json')
  if (!existsSync(path)) throw new Error(`Skill not found: ${skillId}`)
  return readJson(path)
}

export function loadModule(skillId, moduleId) {
  const path = join(DATA_DIR, 'skills', skillId, 'modules', `${moduleId}.json`)
  if (!existsSync(path)) throw new Error(`Module not found: ${skillId}/${moduleId}`)
  return readJson(path)
}

function loadCurriculum() {
  try {
    const catalog = loadCatalog()
    const manifests = (catalog.skills || []).map(s => {
      try { return loadSkillManifest(s.id) } catch { return null }
    }).filter(Boolean)
    return buildCurriculum(catalog, manifests)
  } catch {
    return loadBundledCurriculum()
  }
}

function brainFilePath() {
  return join(syncDirPath(), 'brain.json')
}

function loadBrainState() {
  try {
    if (existsSync(brainFilePath())) return readJson(brainFilePath())
  } catch { /* ignore */ }
  return null
}

function saveBrainState(state) {
  const dir = syncDirPath()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeJson(brainFilePath(), state)
}

export function getBrain(progress = loadProgress()) {
  const engine = new AdaptiveEngine({
    curriculum: loadCurriculum(),
    state: progress.studentMemory?.brain || loadBrainState(),
  })
  hydrateFromProgress(engine, progress)
  return engine
}

function attachBrain(progress, event, { persist = true } = {}) {
  const engine = getBrain(progress)
  if (event) engine.observe(event)
  const snapshot = engine.snapshot()
  progress.studentMemory = {
    ...(progress.studentMemory || {}),
    brain: engine.state,
    recurring_growth_areas: (snapshot.struggles || []).map(s => s.id),
  }
  saveBrainState(engine.state)
  try {
    writeLearnerJson('graph', snapshot.graph)
  } catch { /* local graph is best-effort */ }
  if (persist) saveProgress(progress)
  return snapshot
}

export function listSkills() {
  const skillsDir = join(DATA_DIR, 'skills')
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

function getModuleOrder(skillId) {
  const manifest = loadSkillManifest(skillId)
  return manifest.modules
}

function isFoundationComplete(progress, catalog) {
  const foundation = catalog.foundationSkill
  const manifest = loadSkillManifest(foundation)
  const launchpadModules = manifest.modules.filter(m => m.pack === 'launchpad')
  return launchpadModules.every(m => progress.completedModules[`${foundation}:${m.id}`])
}

function skillAccess(skillId, progress, catalog) {
  const skill = catalog.skills.find(s => s.id === skillId)
  if (!skill) return { unlocked: false, reason: 'unknown_skill' }
  if (!skill.requiresFoundation) return { unlocked: true }
  if (isFoundationComplete(progress, catalog)) return { unlocked: true }
  return { unlocked: false, reason: 'foundation_required', foundationSkill: catalog.foundationSkill }
}

function buildStudentMemory(progress, catalog) {
  const memory = { ...progress.studentMemory }
  const session = progress.session
  if (!session?.skillId) return memory

  const manifest = loadSkillManifest(session.skillId)
  const completedInSkill = Object.keys(progress.completedModules)
    .filter(k => k.startsWith(`${session.skillId}:`))
    .length

  const upcoming = manifest.modules
    .slice(completedInSkill)
    .flatMap(m => m.concepts || [])
    .filter(c => !memory.concepts_mastered?.includes(c))

  memory.unknown_concepts_ahead = upcoming.slice(0, 5)
  memory.concepts_ahead = {
    gap: memory.terminology_gaps || [],
    unknown: upcoming.slice(0, 8),
  }

  const allScores = Object.values(progress.scores)
  if (allScores.length > 0) {
    const dimTotals = {}
    for (const score of allScores) {
      for (const dim of DIMENSIONS) {
        if (score[dim] != null) {
          dimTotals[dim] = dimTotals[dim] || []
          dimTotals[dim].push(score[dim])
        }
      }
    }
    memory.dimension_watch = {}
    for (const [dim, vals] of Object.entries(dimTotals)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      memory.dimension_watch[dim] = {
        average: Math.round(avg * 10) / 10,
        trend: vals.length >= 2 && vals[vals.length - 1] < vals[0] ? 'declining' : vals.length >= 2 ? 'improving' : 'insufficient_data',
      }
    }
    const weak = Object.entries(memory.dimension_watch)
      .filter(([, v]) => v.average < 3)
      .map(([k]) => k)
    memory.recurring_growth_areas = weak
  }

  return memory
}

function promptSuggestions(progress, catalog, extra = []) {
  const suggestions = [...extra]
  const session = progress.session
  if (!session) {
    suggestions.push(`synapsoul start --skill ${catalog.foundationSkill}`)
    suggestions.push('synapsoul catalog')
    return suggestions
  }
  const step = session.step
  if (step === 'DECIDE') suggestions.push('synapsoul decide <A|B> --reasoning "<your reason>"')
  else if (step === 'REFLECT') suggestions.push('synapsoul report \'{"event_type":"module_evaluation",...}\'')
  else suggestions.push(`synapsoul next --summary "<what you did>" --evidence "<proof>"`)
  suggestions.push('synapsoul hint')
  suggestions.push('synapsoul status')
  return suggestions
}

function sessionPayload(progress, catalog) {
  const session = progress.session
  if (!session) return null

  const module = loadModule(session.skillId, session.moduleId)
  const stepContent = module.steps[session.step]
  const manifest = loadSkillManifest(session.skillId)
  const skillMeta = catalog.skills.find(s => s.id === session.skillId)

  return {
    skill: { id: session.skillId, title: manifest.title, track: session.track || progress.profile.track },
    module: { id: session.moduleId, title: module.title, pack: module.pack, concepts: module.concepts },
    step: session.step,
    stepIndex: STEPS.indexOf(session.step),
    content: stepContent,
    hintsUsed: session.hintsUsed || 0,
    decision: progress.decisions[`${session.skillId}:${session.moduleId}`] || null,
    skillMeta,
  }
}

export function cmdStatus(json) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const session = sessionPayload(progress, catalog)
  const memory = buildStudentMemory(progress, catalog)

  const readiness = computeReadinessScore(progress, catalog)
  const headlineDimensions = computeHeadlineDimensions(progress, catalog)
  const badges = computeBadges(progress, catalog)
  const profileRequired = !progress.profile_confirmed && !progress.profile?.confirmed

  const brainSnap = attachBrain(progress, null, { persist: false })
  const result = {
    status: profileRequired ? 'profile_required' : session ? 'active' : 'no_session',
    message: profileRequired
      ? 'Complete your profile to unlock bootcamp.'
      : session
        ? `${session.skill.title} · ${session.module.title} · ${session.step}`
        : 'No active session. Run synapsoul start to begin.',
    profile: progress.profile,
    profile_ready: progress.profile_ready,
    profile_confirmed: progress.profile_confirmed || progress.profile?.confirmed,
    public_profile_ready: progress.public_profile_ready,
    profile_url: progress.profile?.username ? `${PRODUCTION_SITE}/u/${progress.profile.username}` : null,
    readiness_score: readiness,
    headline_dimensions: headlineDimensions,
    badges,
    session,
    completedCount: Object.keys(progress.completedModules).length,
    portfolioCount: progress.portfolio.length,
    student_memory: memory,
    brain: brainSnap,
    graph: brainSnap.graph || null,
    fingerprint: brainSnap.fingerprint || brainSnap.graph?.fingerprint || null,
    prompt_suggestions: profileRequired
      ? ['synapsoul profile', 'synapsoul profile update --name "..." --degree "..." --bio "..."', 'synapsoul profile confirm']
      : promptSuggestions(progress, catalog),
  }

  return json ? result : formatStatus(result)
}

export async function cmdGraph({ json } = {}) {
  const progress = loadProgress()
  const snapshot = attachBrain(progress, null, { persist: true })
  const graph = snapshot.graph
  try {
    if (graph) writeLearnerJson('graph', graph)
  } catch { /* local graph is best-effort */ }

  if (graph && ollamaConfigured()) {
    try {
      const hiring = await maybeEnrichHiring(graph, { ollamaComplete })
      graph.hiring = hiring
    } catch { /* heuristic stands */ }
  }

  const result = {
    status: 'cognitive_graph',
    claim: graph?.claim,
    fingerprint: graph?.fingerprint || null,
    frontier: graph?.frontier || [],
    blockers: graph?.blockers || [],
    hiring: graph?.hiring || null,
    ledger: (graph?.ledger || []).slice(0, 12),
    eventCount: graph?.eventCount || 0,
    graph,
  }
  if (json) return result
  const lines = [
    'SynapSoul Cognitive Graph',
    graph?.claim || '',
    graph?.fingerprint?.summary || '',
    recLine(graph),
    ...(graph?.hiring?.sentences || []),
  ].filter(Boolean)
  return lines.join('\n')
}

function recLine(graph) {
  const rec = graph?.recommendedNext
  if (!rec) return ''
  return `Frontier: ${rec.moduleTitle} (${rec.skillTitle}) · p(know)=${rec.pKnow}`
}

export function cmdCatalog(json) {
  const catalog = loadCatalog()
  const progress = loadProgress()
  const skills = catalog.skills.map(skill => {
    const access = skillAccess(skill.id, progress, catalog)
    const manifest = loadSkillManifest(skill.id)
    const completed = manifest.modules.filter(m =>
      progress.completedModules[`${skill.id}:${m.id}`]
    ).length
    return {
      ...skill,
      moduleCount: manifest.modules.length,
      completedModules: completed,
      unlocked: access.unlocked,
      accessReason: access.reason || null,
      packs: manifest.packs,
      tracks: manifest.tracks || ['general'],
    }
  })

  const result = { skills, foundationSkill: catalog.foundationSkill, tracks: catalog.tracks }
  return json ? result : formatCatalog(result)
}

export function cmdStart({ skill, track, json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const brainSnap = attachBrain(progress)
  const skillId = skill || brainSnap.recommendedNext?.skillId || catalog.foundationSkill || 'system-design-fundamentals'
  const access = skillAccess(skillId, progress, catalog)

  if (!access.unlocked) {
    return json ? {
      status: 'foundation_required',
      message: `Complete ${catalog.foundationSkill} Launchpad first.`,
      foundationSkill: catalog.foundationSkill,
      prompt_suggestions: [`synapsoul start --skill ${catalog.foundationSkill}`, 'synapsoul catalog'],
    } : `Foundation required. Complete ${catalog.foundationSkill} first.`
  }

  const manifest = loadSkillManifest(skillId)
  const selectedTrack = track || progress.profile.track || manifest.tracks?.[0] || 'node'
  const recModule = !skill && brainSnap.recommendedNext?.skillId === skillId
    ? brainSnap.recommendedNext.moduleId
    : null
  const nextModule = (recModule && manifest.modules.find(m => m.id === recModule))
    || manifest.modules.find(m => !progress.completedModules[`${skillId}:${m.id}`])
  const moduleId = nextModule?.id || manifest.modules[0].id

  progress.session = {
    skillId,
    moduleId,
    step: 'CONTEXT',
    track: selectedTrack,
    startedAt: new Date().toISOString(),
    hintsUsed: 0,
  }
  progress.profile.track = selectedTrack
  const snapshot = attachBrain(progress, {
    type: 'session_step',
    skillId,
    moduleId,
    payload: { step: 'CONTEXT', n: 1 },
  })

  const module = loadModule(skillId, moduleId)
  const result = {
    status: progress.profile.pretestCompleted ? 'resuming' : 'first_run',
    message: `Started ${manifest.title}: ${module.title}`,
    onboarding: progress.profile.pretestCompleted ? 'resuming' : 'first_run',
    session: sessionPayload(progress, catalog),
    student_memory: buildStudentMemory(progress, catalog),
    brain: snapshot,
    prompt_suggestions: promptSuggestions(progress, catalog),
  }

  return json ? result : formatStart(result)
}

export function cmdNext({ summary, evidence, proofFile, json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const session = progress.session
  if (!session) return error('no_session', 'No active session.', json)

  let proof = { summary, evidence: evidence ? [evidence] : [] }
  if (proofFile) {
    proof = readJson(proofFile)
  }
  if (!proof.summary || !proof.evidence?.length) {
    return error('proof_required', 'synapsoul next requires --summary and --evidence', json)
  }

  const step = session.step
  const stepIndex = STEPS.indexOf(step)
  if (stepIndex === -1) return error('invalid_step', `Unknown step: ${step}`, json)

  session.stepProof = session.stepProof || {}
  session.stepProof[step] = proof

  if (step === 'REFLECT') {
    return error('reflect_gate', 'Complete module evaluation with synapsoul report before advancing.', json, [
      'synapsoul report \'{"event_type":"module_evaluation",...}\'',
    ])
  }

  const nextStep = STEPS[stepIndex + 1]
  if (!nextStep) return error('module_end', 'Module complete. Submit evaluation via synapsoul report.', json)

  session.step = nextStep
  const snapshot = attachBrain(progress, {
    type: 'session_step',
    skillId: session.skillId,
    moduleId: session.moduleId,
    payload: { step: nextStep, n: stepIndex + 1 },
  })

  const interlude = checkInterlude(session.skillId, session.moduleId, nextStep, catalog)
  const result = {
    status: 'step_advanced',
    message: `Advanced to ${nextStep}`,
    previousStep: step,
    session: sessionPayload(progress, catalog),
    interlude,
    student_memory: buildStudentMemory(progress, catalog),
    brain: snapshot,
    prompt_suggestions: promptSuggestions(progress, catalog),
  }
  return json ? result : `Advanced to ${nextStep}`
}

export function cmdDecide({ choice, reasoning, json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const session = progress.session
  if (!session) return error('no_session', 'No active session.', json)
  if (session.step !== 'DECIDE') return error('step_mismatch', `Expected DECIDE, currently at ${session.step}`, json)
  if (!['A', 'B'].includes(choice)) return error('invalid_choice', 'Choice must be A or B', json)
  if (!reasoning?.trim()) return error('reasoning_required', 'synapsoul decide requires --reasoning', json)

  const key = `${session.skillId}:${session.moduleId}`
  progress.decisions[key] = choice
  session.step = 'BUILD'
  session.decideReasoning = reasoning
  const snapshot = attachBrain(progress, {
    type: 'decide',
    skillId: session.skillId,
    moduleId: session.moduleId,
    payload: { choice, reasoning },
  })

  const result = {
    status: 'decision_recorded',
    message: `Recorded choice ${choice}`,
    decision: { choice, reasoning },
    session: sessionPayload(progress, catalog),
    student_memory: buildStudentMemory(progress, catalog),
    brain: snapshot,
    prompt_suggestions: promptSuggestions(progress, catalog),
  }
  return json ? result : `Decision ${choice} recorded.`
}

export async function cmdHint({ json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const session = progress.session
  if (!session) return error('no_session', 'No active session.', json)

  const module = loadModule(session.skillId, session.moduleId)
  const stepContent = module.steps[session.step]
  const hints = stepContent?.hints || []
  session.hintsUsed = (session.hintsUsed || 0) + 1
  const hintIndex = Math.min(session.hintsUsed - 1, hints.length - 1)
  const hint = hints[hintIndex] || 'Re-read the step goal. What is the smallest test you could run to learn one thing?'

  const snapshot = attachBrain(progress, {
    type: 'hint',
    skillId: session.skillId,
    moduleId: session.moduleId,
    payload: { n: session.hintsUsed, step: session.step },
  })
  const llm = getLearnLabLLM()
  const llmHint = await llm.hint({
    event: { type: 'hint' },
    skillId: session.skillId,
    moduleId: session.moduleId,
    step: session.step,
    track: session.track || progress.profile?.track,
    moduleTitle: module.title,
    hintText: hint,
    hintsUsed: session.hintsUsed,
    why: snapshot.why,
    brainSnapshot: snapshot,
    profile: progress.profile,
    moduleJson: module,
    stepContent,
  })
  const coach = await maybeCoachNote({
    event: { type: 'hint' },
    moduleTitle: module.title,
    hintText: hint,
    why: snapshot.why,
    brainSnapshot: snapshot,
  })

  const result = {
    status: 'hint',
    message: hint,
    nudge: llmHint.nudge,
    llm: llmHint,
    hintsUsed: session.hintsUsed,
    scorePenalty: 'Hints reduce independent performance scores.',
    coach,
    brain: snapshot,
    session: sessionPayload(progress, catalog),
    prompt_suggestions: promptSuggestions(progress, catalog),
  }
  return json ? result : hint
}

export function cmdRef({ topic, json }) {
  const glossary = loadGlossary()
  const entry = glossary.terms.find(t =>
    t.id === topic || t.term.toLowerCase() === topic.toLowerCase()
  )
  if (!entry) {
    const topics = glossary.terms.map(t => t.id).join(', ')
    return error('not_found', `Topic not found. Available: ${topics}`, json)
  }
  return json ? entry : `${entry.term}: ${entry.definition}\n\nExample: ${entry.example}`
}

export function cmdReport({ reportJson, json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const session = progress.session
  if (!session) return error('no_session', 'No active session.', json)
  if (session.step !== 'REFLECT') return error('step_mismatch', `Report only valid at REFLECT (currently ${session.step})`, json)

  let report
  try {
    report = JSON.parse(reportJson)
  } catch {
    return error('invalid_json', 'Report must be valid JSON', json)
  }

  if (report.event_type !== 'module_evaluation') {
    return error('invalid_event', 'REFLECT requires event_type: module_evaluation', json)
  }

  const data = report.data || report
  if (!data.overall || data.overall < 1 || data.overall > 5) {
    return error('score_required', 'Report must include data.overall (1-5)', json)
  }

  const key = `${session.skillId}:${session.moduleId}`
  progress.scores[key] = {
    overall: data.overall,
    narrative: data.narrative || '',
    dimensions: data.dimensions || {},
    hintsUsed: session.hintsUsed || 0,
    ...flattenDimensions(data.dimensions),
  }
  progress.completedModules[key] = {
    completedAt: new Date().toISOString(),
    score: data.overall,
    track: session.track,
  }

  if (data.student_knowledge) {
    progress.studentMemory = {
      ...progress.studentMemory,
      effective_level: data.student_knowledge.effective_level || progress.studentMemory.effective_level,
      confidence_level: data.student_knowledge.confidence_level || progress.studentMemory.confidence_level,
      learning_style_signals: data.student_knowledge.learning_style_signals || [],
      effective_teaching_approaches: data.student_knowledge.teaching_approaches || [],
      terminology_gaps: data.student_knowledge.terminology_gaps || [],
    }
    if (data.student_knowledge.concepts_demonstrated) {
      progress.studentMemory.concepts_mastered = [
        ...(progress.studentMemory.concepts_mastered || []),
        ...data.student_knowledge.concepts_demonstrated,
      ]
    }
  }

  if (data.public_evidence?.length) {
    progress.portfolio.push(...data.public_evidence.map(e => ({
      ...e,
      skillId: session.skillId,
      moduleId: session.moduleId,
      recordedAt: new Date().toISOString(),
    })))
  }

  const manifest = loadSkillManifest(session.skillId)
  const moduleIds = manifest.modules.map(m => m.id)
  const currentIdx = moduleIds.indexOf(session.moduleId)
  const nextModuleId = moduleIds[currentIdx + 1]

  let packCompleted = false
  const module = loadModule(session.skillId, session.moduleId)
  const launchpadModules = manifest.modules.filter(m => m.pack === 'launchpad')
  if (module.pack === 'launchpad') {
    packCompleted = launchpadModules.every(m => progress.completedModules[`${session.skillId}:${m.id}`])
  }

  if (nextModuleId) {
    progress.session = {
      ...session,
      moduleId: nextModuleId,
      step: 'CONTEXT',
      hintsUsed: 0,
      startedAt: new Date().toISOString(),
    }
  } else {
    progress.session = null
  }

  saveProgress(progress)

  const snapshot = attachBrain(progress, {
    type: 'module_complete',
    skillId: session.skillId,
    moduleId: session.moduleId,
    payload: {
      score: data.overall,
      overall: data.overall,
      hintsUsed: session.hintsUsed || 0,
      dimensions: data.dimensions,
    },
  })

  const result = {
    status: packCompleted ? 'pack_completed' : nextModuleId ? 'module_completed' : 'skill_completed',
    message: packCompleted ? 'Launchpad pack completed!' : 'Module evaluation accepted.',
    type: packCompleted ? 'pack_completed' : 'module_completed',
    scores: progress.scores[key],
    packCompleted,
    nextModule: nextModuleId ? loadModule(session.skillId, nextModuleId).title : null,
    portfolioCount: progress.portfolio.length,
    student_memory: buildStudentMemory(progress, catalog),
    brain: snapshot,
    prompt_suggestions: nextModuleId
      ? [`synapsoul status`, `Continue with next module in ${session.skillId}`]
      : ['synapsoul catalog', 'synapsoul start --skill <next-skill>'],
  }
  return json ? result : result.message
}

function flattenDimensions(dimensions) {
  const flat = {}
  if (!dimensions) return flat
  for (const [dim, val] of Object.entries(dimensions)) {
    flat[dim] = typeof val === 'object' ? val.score : val
  }
  return flat
}

function checkInterlude(skillId, moduleId, step, catalog) {
  if (step !== 'CONTEXT') return null
  const interludes = loadInterludes()
  return interludes.find(i => i.skillId === skillId && i.afterModule === moduleId) || null
}

function error(code, message, json, suggestions = []) {
  const result = { status: 'error', code, message, prompt_suggestions: suggestions }
  return json ? result : `Error: ${message}`
}

function formatStatus(r) {
  return `${r.message}\nCompleted: ${r.completedCount} modules · Portfolio: ${r.portfolioCount} items`
}

function formatCatalog(r) {
  return r.skills.map(s => `${s.unlocked ? '✓' : '○'} ${s.title} (${s.completedModules}/${s.moduleCount})`).join('\n')
}

function formatStart(r) {
  return r.message
}

export function cmdProfile({ json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const result = {
    status: 'profile',
    profile: progress.profile,
    profile_ready: progress.profile_ready,
    profile_confirmed: progress.profile_confirmed || progress.profile?.confirmed,
    missing_profile_fields: [
      !progress.profile?.name && 'name',
      !progress.profile?.degree && 'degree',
      !progress.profile?.bio && 'bio',
    ].filter(Boolean),
    readiness_score: computeReadinessScore(progress, catalog),
    headline_dimensions: computeHeadlineDimensions(progress, catalog),
    portfolio: progress.portfolio,
    badges: computeBadges(progress, catalog),
    hiring_summary: progress.profile?.hiring_summary || generateHiringSummary(progress, catalog),
    prompt_suggestions: progress.profile?.confirmed
      ? ['synapsoul status', 'synapsoul catalog']
      : ['synapsoul profile update --name "..." --degree "..." --bio "..."', 'synapsoul profile confirm'],
  }
  return json ? result : JSON.stringify(result.profile, null, 2)
}

export function cmdProfileUpdate({ name, degree, bio, username, college, track, json }) {
  const progress = loadProgress()
  progress.profile = progress.profile || {}
  if (name) progress.profile.name = name
  if (degree) progress.profile.degree = degree
  if (bio) progress.profile.bio = bio
  if (username) progress.profile.username = username
  if (college) progress.profile.college_name = college
  if (track) progress.profile.track = track
  progress.profile_ready = !!(progress.profile.name && progress.profile.degree && progress.profile.bio)
  progress.profile.confirmed = false
  progress.profile_confirmed = false
  saveProgress(progress)
  const result = {
    status: 'profile_updated',
    profile: progress.profile,
    profile_ready: progress.profile_ready,
    profile_url: progress.profile.username ? `${PRODUCTION_SITE}/u/${progress.profile.username}` : null,
    prompt_suggestions: ['synapsoul profile confirm'],
  }
  return json ? result : 'Profile updated. Run synapsoul profile confirm when ready.'
}

export function cmdProfileConfirm({ json }) {
  const progress = loadProgress()
  if (!progress.profile?.name || !progress.profile?.degree || !progress.profile?.bio) {
    return error('profile_incomplete', 'Name, degree, and bio are required.', json, ['synapsoul profile update --name "..." --degree "..." --bio "..."'])
  }
  progress.profile.confirmed = true
  progress.profile_confirmed = true
  progress.profile.confirmedAt = new Date().toISOString()
  saveProgress(progress)
  const result = {
    status: 'profile_confirmed',
    message: 'Profile confirmed. Bootcamp unlocked.',
    profile: progress.profile,
    profile_url: progress.profile.username ? `${PRODUCTION_SITE}/u/${progress.profile.username}` : null,
    prompt_suggestions: [`synapsoul start --skill system-design-fundamentals`, 'synapsoul catalog'],
  }
  return json ? result : result.message
}

export function cmdFeedback({ summary, type, json }) {
  const progress = loadProgress()
  const dir = feedbackDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const entry = {
    id: `fb-${Date.now()}`,
    type: type || 'feedback',
    summary,
    at: new Date().toISOString(),
    session: progress.session?.skillId || null,
  }
  const feedbackPath = join(dir, `${entry.id}.json`)
  writeJson(feedbackPath, entry)
  const result = {
    status: 'feedback_recorded',
    message: 'Feedback recorded. Thank you.',
    id: entry.id,
    prompt_suggestions: ['synapsoul status'],
  }
  return json ? result : result.message
}

export function cmdLeaderboard({ json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const local = {
    username: progress.profile?.username || 'you',
    name: progress.profile?.name || 'You',
    readiness_score: computeReadinessScore(progress, catalog),
    modules_completed: Object.keys(progress.completedModules).length,
    skills_completed: computeBadges(progress, catalog).length,
  }
  let demo = []
  try { demo = readJson(join(DATA_DIR, 'leaderboard.json')) } catch { demo = [] }
  const entries = [local, ...demo.filter(e => e.username !== local.username)]
    .sort((a, b) => b.readiness_score - a.readiness_score)
    .map((e, i) => ({ ...e, rank: i + 1 }))
  const result = { status: 'leaderboard', entries, refreshed_at: new Date().toISOString() }
  return json ? result : entries.map(e => `#${e.rank} ${e.name} — ${e.readiness_score}/100`).join('\n')
}

export function buildPublicProfile(progress, catalog) {
  const badges = computeBadges(progress, catalog)
  return {
    username: progress.profile?.username || null,
    name: progress.profile?.name || 'Anonymous',
    degree: progress.profile?.degree || '',
    college_name: progress.profile?.college_name || '',
    bio: progress.profile?.bio || '',
    track: progress.profile?.track || 'node',
    readiness_score: computeReadinessScore(progress, catalog),
    headline_dimensions: computeHeadlineDimensions(progress, catalog),
    portfolio: (progress.portfolio || []).slice(0, 8),
    badges,
    hiring_summary: generateHiringSummary(progress, catalog),
    modules_completed: Object.keys(progress.completedModules || {}).length,
    skills_completed: badges.length,
    headline: generateHiringSummary(progress, catalog),
    updated_at: new Date().toISOString(),
  }
}

export function cmdStatusAll({ json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const skills = catalog.skills.map(skill => {
    const manifest = loadSkillManifest(skill.id)
    const access = skillAccess(skill.id, progress, catalog)
    const completed = manifest.modules.filter(m =>
      progress.completedModules[`${skill.id}:${m.id}`]
    ).length
    const active = progress.session?.skillId === skill.id
    return {
      id: skill.id,
      title: skill.title,
      unlocked: access.unlocked,
      completedModules: completed,
      moduleCount: manifest.modules.length,
      active,
      currentStep: active ? progress.session?.step : null,
      currentModule: active ? progress.session?.moduleId : null,
    }
  })
  const result = {
    status: 'all_skills',
    readiness_score: computeReadinessScore(progress, catalog),
    active_session: progress.session
      ? { skillId: progress.session.skillId, moduleId: progress.session.moduleId, step: progress.session.step }
      : null,
    skills,
    completedCount: Object.keys(progress.completedModules).length,
    portfolioCount: progress.portfolio?.length || 0,
    prompt_suggestions: progress.session
      ? ['synapsoul status', `synapsoul start --skill ${progress.session.skillId}`]
      : ['synapsoul catalog', `synapsoul start --skill ${catalog.foundationSkill}`],
  }
  return json ? result : skills.map(s =>
    `${s.active ? '▶' : s.unlocked ? '✓' : '○'} ${s.title}: ${s.completedModules}/${s.moduleCount}${s.active ? ` (${s.currentStep})` : ''}`
  ).join('\n')
}

export async function cmdLogin({ email, password, json, github, token }) {
  const siteHint = websiteRegisterHint()

  if (token) {
    try {
      const auth = await loginWithToken(token)
      saveToken(auth.token, auth.user?.email)
      return loggedInResult(auth, json)
    } catch (err) {
      return error('login_failed', err.message, json, [
        `Open ${PRODUCTION_SITE}`,
        `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
        `${CLI_NAME} login --github --json`,
      ])
    }
  }

  if (github) {
    try {
      const apiBase = resolveSyncApiBase({ login: true }) || PRODUCTION_API
      const providers = await fetchAuthProviders(apiBase)
      if (!providers?.github) {
        const result = {
          status: 'login_required',
          login_required: true,
          message: `GitHub OAuth is not configured. Use the website: ${PRODUCTION_SITE}. ${siteHint}`,
          site: PRODUCTION_SITE,
          api: apiBase,
          prompt_suggestions: [
            `${CLI_NAME} register --email YOUR_EMAIL --password YOUR_PASSWORD --name "Your Name" --json`,
            `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
            `Open ${PRODUCTION_SITE}`,
          ],
        }
        return json ? result : result.message
      }
      const nonce = generateCliNonce()
      const url = githubCliStartUrl(nonce, apiBase)
      console.error(`Complete GitHub sign-in in the browser:\n  ${url}\nIf the CLI is still waiting, paste the token from the site:\n  ${CLI_NAME} login --token YOUR_TOKEN`)
      openSite(url)
      const auth = await pollCliAuth(nonce, apiBase)
      saveToken(auth.token, auth.user?.email)
      return loggedInResult(auth, json)
    } catch (err) {
      return error('login_failed', err.message, json, [
        `Open ${PRODUCTION_SITE}`,
        `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
        `${CLI_NAME} login --token YOUR_TOKEN --json`,
      ])
    }
  }

  let userEmail = email
  let userPassword = password
  if (!userEmail || !userPassword) {
    if (process.stdin.isTTY) {
      openSite(PRODUCTION_SITE)
      userEmail = userEmail || await askLine('Email: ')
      userPassword = userPassword || await askLine('Password: ')
    } else {
      const result = {
        status: 'login_required',
        login_required: true,
        message: `Sign in before teaching. IDE: ${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json  or  ${CLI_NAME} login --github --json. ${siteHint}`,
        site: PRODUCTION_SITE,
        api: resolveSyncApiBase({ login: true }) || PRODUCTION_API,
        prompt_suggestions: [
          `${CLI_NAME} register --email YOUR_EMAIL --password YOUR_PASSWORD --name "Your Name" --json`,
          `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
          `${CLI_NAME} login --github --json`,
          `Open ${PRODUCTION_SITE}`,
        ],
      }
      return json ? result : result.message
    }
  }
  try {
    const auth = await loginToApi(userEmail, userPassword)
    saveToken(auth.token, userEmail)
    return loggedInResult(auth, json, userEmail)
  } catch (err) {
    return error('login_failed', err.message, json, [
      `Open ${PRODUCTION_SITE}`,
      `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
      `${CLI_NAME} login --github --json`,
    ])
  }
}

export async function cmdRegister({ email, password, name, json }) {
  const siteHint = websiteRegisterHint()
  let userEmail = email
  let userPassword = password
  let userName = name
  if (!userEmail || !userPassword || !userName) {
    if (process.stdin.isTTY) {
      userName = userName || await askLine('Name: ')
      userEmail = userEmail || await askLine('Email: ')
      userPassword = userPassword || await askLine('Password: ')
    } else {
      const result = {
        status: 'register_required',
        login_required: true,
        message: `Register in the IDE or on the website before teaching. ${siteHint}`,
        site: PRODUCTION_SITE,
        api: resolveSyncApiBase({ login: true }) || PRODUCTION_API,
        prompt_suggestions: [
          `${CLI_NAME} register --email YOUR_EMAIL --password YOUR_PASSWORD --name "Your Name" --json`,
          `${CLI_NAME} login --github --json`,
          `Open ${PRODUCTION_SITE}`,
        ],
      }
      return json ? result : result.message
    }
  }
  try {
    const auth = await registerToApi({ email: userEmail, password: userPassword, name: userName })
    saveToken(auth.token, userEmail)
    return loggedInResult(auth, json, userEmail)
  } catch (err) {
    return error('register_failed', err.message, json, [
      `Open ${PRODUCTION_SITE}`,
      `${CLI_NAME} register --email YOUR_EMAIL --password YOUR_PASSWORD --name "Your Name" --json`,
      `${CLI_NAME} login --github --json`,
    ])
  }
}

function loggedInResult(auth, json, fallbackEmail) {
  const result = {
    status: 'logged_in',
    cli_logged_in: true,
    login_required: false,
    message: `Logged in. Progress will sync to ${auth.apiBase}.`,
    user: auth.user
      ? { email: auth.user.email, name: auth.user.name, username: auth.user.username }
      : { email: fallbackEmail || null },
    api: auth.apiBase,
    prompt_suggestions: [`${CLI_NAME} start --json`, `${CLI_NAME} status --json`],
  }
  return json ? result : result.message
}

function askLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(String(answer || '').trim())
    })
  })
}

export async function cmdSync({ publish, json, email, password }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const syncDir = syncDirPath()
  if (!existsSync(syncDir)) mkdirSync(syncDir, { recursive: true })

  const exportData = {
    synced_at: new Date().toISOString(),
    progress,
    public_profile: buildPublicProfile(progress, catalog),
    brain: attachBrain(progress, undefined, { persist: false }),
  }
  const syncPath = join(syncDir, 'latest.json')
  writeJson(syncPath, exportData)

  let publishedUrl = null
  if (publish) {
    const username = progress.profile?.username
    if (!username) {
      return error('username_required', 'Set username via synapsoul profile update --username "..." before --publish', json, [
        'synapsoul profile update --username "your-handle"',
      ])
    }
    const dir = publicDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const publicProfile = buildPublicProfile(progress, catalog)
    writeJson(join(dir, `${username}.json`), publicProfile)
    publishedUrl = `${PRODUCTION_SITE}/u/${username}`
  }

  let cloud = { attempted: false }
  const loginRequested = Boolean(email && password)
  const apiBase = resolveSyncApiBase({ login: loginRequested })
  try {
    if (loginRequested) {
      const auth = await loginToApi(email, password, apiBase || PRODUCTION_API)
      saveToken(auth.token, email)
      cloud = await pushProgressAndBrain({
        apiBase: auth.apiBase,
        token: auth.token,
        progress,
        brain: exportData.brain,
      })
      cloud.attempted = true
      cloud.via = 'email'
    } else if (apiBase && loadSavedToken()) {
      cloud = await pushProgressAndBrain({
        apiBase,
        token: loadSavedToken(),
        progress,
        brain: exportData.brain,
      })
      cloud.attempted = true
      cloud.via = 'saved_token'
    } else if (!apiBase) {
      cloud = {
        attempted: false,
        skipped: `Set SYNAPSOUL_API_URL=${PRODUCTION_API} then re-run sync, or sign in at ${PRODUCTION_SITE}`,
      }
    } else {
      cloud = {
        attempted: false,
        skipped: `Sign in at ${PRODUCTION_SITE} or run: synapsoul login --email you@example.com --password your-password --json`,
      }
    }
  } catch (e) {
    cloud = { attempted: true, ok: false, error: e.message }
  }

  const cloudOk = cloud.ok === true
  const result = {
    status: cloud.attempted && !cloudOk ? 'sync_partial' : 'synced',
    message: cloudOk
      ? `Progress synced locally and to ${cloud.api || apiBase}.`
      : publish
        ? 'Progress synced locally and public profile published.'
        : cloud.skipped
          ? `Progress saved locally. ${cloud.skipped}`
          : cloud.error
            ? `Progress saved locally. Cloud sync failed: ${cloud.error}`
            : 'Progress synced to data/sync/latest.json',
    sync_path: syncPath,
    cloud,
    profile_url: publishedUrl || (progress.profile?.username ? `${PRODUCTION_SITE}/u/${progress.profile.username}` : null),
    readiness_score: exportData.public_profile.readiness_score,
    prompt_suggestions: cloudOk
      ? ['synapsoul status', `Open ${PRODUCTION_SITE}`]
      : loginRequested
        ? ['synapsoul status']
        : [`synapsoul login --email you@example.com --password your-password --json`, `Sign in at ${PRODUCTION_SITE}`],
  }
  return json ? result : result.message
}

const PRETEST_QUESTIONS = [
  { id: 1, q: 'What happens when you visit a URL in your browser?', options: ['DNS lookup then HTTP request', 'Direct database query', 'File system read only'] },
  { id: 2, q: 'What is the main purpose of a REST API?', options: ['Exchange data over HTTP with standard methods', 'Render HTML pages', 'Compile code'] },
  { id: 3, q: 'Why do production apps use databases instead of in-memory storage?', options: ['Data survives restarts', 'Databases are always faster', 'Memory is illegal in production'] },
  { id: 4, q: 'What does a 404 HTTP status mean?', options: ['Resource not found', 'Server error', 'Success'] },
  { id: 5, q: 'What is a vertical slice in project planning?', options: ['End-to-end feature through all layers', 'Database layer only', 'UI mockup only'] },
]

const PRETEST_ANSWER_KEY = { 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A' }

export function cmdPretest({ json }) {
  const progress = loadProgress()
  if (!progress.pretest) {
    progress.pretest = { startedAt: new Date().toISOString(), answers: {} }
    saveProgress(progress)
  }
  const result = {
    status: 'pretest',
    message: 'Five quick questions — not graded, helps calibrate pacing.',
    questions: PRETEST_QUESTIONS,
    completed: progress.profile.pretestCompleted,
    prompt_suggestions: progress.profile.pretestCompleted
      ? ['synapsoul start --skill system-design-fundamentals']
      : ['synapsoul pretest submit --answers "1A,2A,3A,4A,5A"', 'Answer one question at a time in chat'],
  }
  return json ? result : 'Pretest ready. Answer questions in chat.'
}

export function cmdPretestSubmit({ answers, json }) {
  const progress = loadProgress()
  if (!answers?.trim()) {
    return error('answers_required', 'synapsoul pretest submit --answers "1A,2A,3A,4A,5A"', json, [
      'synapsoul pretest',
      'synapsoul pretest submit --answers "1A,2A,3A,4A,5A"',
    ])
  }

  const parsed = {}
  for (const part of answers.split(',')) {
    const match = part.trim().match(/^(\d)\s*([A-Ca-c])$/)
    if (match) parsed[parseInt(match[1], 10)] = match[2].toUpperCase()
  }

  let correct = 0
  for (const [q, expected] of Object.entries(PRETEST_ANSWER_KEY)) {
    if (parsed[q] === expected) correct++
  }

  progress.pretest = {
    ...progress.pretest,
    answers: parsed,
    submittedAt: new Date().toISOString(),
    score: correct,
    total: 5,
  }
  progress.profile.pretestCompleted = true
  progress.profile.level = correct >= 4 ? 'intermediate' : 'beginner'
  progress.studentMemory = {
    ...progress.studentMemory,
    effective_level: progress.profile.level,
    confidence_level: correct >= 3 ? 'medium' : 'low',
  }
  const snapshot = attachBrain(progress, {
    type: 'pretest',
    payload: { ...progress.pretest, level: progress.profile.level },
  })

  const result = {
    status: 'pretest_complete',
    message: `Pretest complete — ${correct}/5. Level calibrated to ${progress.profile.level}.`,
    score: correct,
    total: 5,
    level: progress.profile.level,
    answers: parsed,
    brain: snapshot,
    prompt_suggestions: [
      'synapsoul profile update --name "..." --degree "..." --bio "..."',
      'synapsoul start --skill system-design-fundamentals',
    ],
  }
  return json ? result : result.message
}

export function cmdScore({ json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const session = progress.session
  if (!session) return error('no_session', 'No active session. Run synapsoul start first.', json, ['synapsoul start'])

  const module = loadModule(session.skillId, session.moduleId)
  const manifest = loadSkillManifest(session.skillId)
  const skillMeta = catalog.skills.find(s => s.id === session.skillId)
  const dimIds = skillMeta?.growthDimensions?.length
    ? skillMeta.growthDimensions
    : catalog.headlineDimensions.map(d => d.id)

  const dimensionTemplate = dimIds.map(dimId => {
    const headline = catalog.headlineDimensions.find(d => d.id === dimId)
    const label = headline?.label || dimId.replace(/_/g, ' ')
    return {
      id: dimId,
      label,
      question: `What evidence did the student show for ${label} at ${session.step}?`,
      rubric: {
        1: 'No relevant evidence',
        2: 'Mentioned concept without application',
        3: 'Adequate reasoning for this step',
        4: 'Strong, specific evidence',
        5: 'Exceptional — tradeoffs and production thinking',
      },
      feedback_slot: '',
      score: null,
    }
  })

  const streak = computeStreak(progress)
  const result = {
    status: 'score_template',
    message: `Score template for ${session.step} — does not advance the session.`,
    step: session.step,
    skill: manifest.title,
    module: module.title,
    hints_used: session.hintsUsed || 0,
    hint_penalty_note: session.hintsUsed > 0 ? 'Reduce dimension scores by ~0.5 per hint used.' : null,
    dimensions: dimensionTemplate,
    streak,
    momentum: streak.days > 0
      ? `${streak.days}-day learning streak — acknowledge progress, then give honest scores.`
      : 'First session today — welcome them and set clear expectations.',
    instructor_flow: [
      'Student says "score my answer" or pastes work.',
      'Run synapsoul score --json (this command).',
      'Fill feedback_slot per dimension with quoted evidence.',
      'Share scores verbally — do NOT run synapsoul next until student is ready.',
    ],
    session: sessionPayload(progress, catalog),
    prompt_suggestions: [
      'Share dimension feedback with the student',
      `synapsoul next --summary "..." --evidence "..."`,
    ],
  }
  return json ? result : `Score template for ${session.step}. Dimensions: ${dimIds.join(', ')}`
}

function computeStreak(progress) {
  const dates = new Set()
  for (const mod of Object.values(progress.completedModules || {})) {
    if (mod.completedAt) dates.add(mod.completedAt.slice(0, 10))
  }
  if (progress.session?.startedAt) dates.add(progress.session.startedAt.slice(0, 10))

  const sorted = [...dates].sort().reverse()
  const today = new Date().toISOString().slice(0, 10)
  let days = 0
  let cursor = today
  for (const d of sorted) {
    if (d === cursor) {
      days++
      const prev = new Date(cursor)
      prev.setDate(prev.getDate() - 1)
      cursor = prev.toISOString().slice(0, 10)
    } else if (days === 0 && d === sorted[0]) {
      days = 1
      break
    } else break
  }
  return { days, active_today: dates.has(today) }
}

export function cmdShare({ json }) {
  const progress = loadProgress()
  const catalog = loadCatalog()
  const readiness = computeReadinessScore(progress, catalog)
  const badges = computeBadges(progress, catalog)
  const completed = Object.keys(progress.completedModules || {}).length
  const portfolioCount = progress.portfolio?.length || 0
  const name = progress.profile?.name || 'I'
  const topSkill = badges.length
    ? badges[badges.length - 1].title
    : catalog.skills.find(s => s.startHere)?.title || 'System Design Fundamentals'
  const username = progress.profile?.username
  const profileUrl = username ? `http://localhost:5173/#/u/${username}` : null

  const markdown = `🚀 ${name === 'I' ? "I'm" : `${name} is`} building job-ready engineering proof with **SynapSoul Learn Hub**!

📊 **Readiness:** ${readiness}/100
🏆 **Top skill:** ${topSkill}
📁 ${completed} modules · ${portfolioCount} portfolio items
${profileUrl ? `🔗 ${profileUrl}` : ''}

The open engineering bootcamp in your IDE — local-first, evidence-backed.

#SynapSoul #Engineering #BuildInPublic`

  const result = {
    status: 'share',
    message: 'Copy this markdown for LinkedIn or Twitter.',
    markdown,
    readiness_score: readiness,
    top_skill: topSkill,
    profile_url: profileUrl,
    prompt_suggestions: ['synapsoul sync --publish', 'synapsoul profile update --username "your-handle"'],
  }
  return json ? result : markdown
}

export async function cmdLearningStats({ json }) {
  const store = getExperienceStore()
  const stats = await store.getStats()
  const result = { status: 'learning_stats', ...stats }
  if (json) return result
  const rate = stats.successRate != null ? `${Math.round(stats.successRate * 100)}%` : 'n/a'
  return `SynapSoul learning: ${stats.patterns} patterns, ${stats.interactions} interactions, ${stats.reactions} reactions, success rate ${rate}`
}

function generateHiringSummary(progress, catalog) {
  const badges = computeBadges(progress, catalog)
  const score = computeReadinessScore(progress, catalog)
  if (badges.length >= 6) return 'Bootcamp completed. Evidence-backed builder with demonstrated engineering judgment.'
  if (score >= 70) return 'Evidence-backed builder with strong production judgment.'
  if (progress.portfolio?.length) return 'Building proof through hands-on modules.'
  return 'App foundation in progress.'
}
