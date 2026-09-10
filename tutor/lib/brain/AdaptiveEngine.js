import { createBkt, updateBkt, evidenceToCorrect } from './bkt.js'
import { createCard, review, isDue, scoreToQuality } from './sm2.js'
import { getSkill, getModule, isSkillUnlocked, prereqReadiness } from './graph.js'
import { loadBundledCurriculum } from './curriculumData.js'
import {
  createState,
  cloneState,
  pushSignal,
  rememberError,
  updateDecisionPattern,
  refreshDerivedMemory,
  markProcessed,
  hasProcessed,
  round2,
} from './memory.js'
import { heuristicCoachNote } from './coach.js'

function evidenceKey(event) {
  if (event.id) return event.id
  const { type, skillId, moduleId, payload } = event
  switch (type) {
    case 'pretest':
      return 'pretest'
    case 'onboarding':
      return `onboarding:${payload?.track || ''}:${payload?.level || ''}`
    case 'module_complete':
      return `module_complete:${skillId}:${moduleId}`
    case 'decide':
      return `decide:${skillId}:${moduleId}`
    case 'verify':
      return `verify:${skillId}:${moduleId}:${payload?.passed ? 'pass' : 'fail'}`
    case 'hint':
    case 'hint_used':
      return `hint:${skillId}:${moduleId}:${payload?.n || payload?.hintsUsed || event.at || ''}`
    case 'score':
      return `score:${skillId}:${moduleId}:${payload?.overall ?? payload?.score ?? ''}`
    case 'session_step':
      return `step:${skillId}:${moduleId}:${payload?.step || ''}:${payload?.n || ''}`
    default:
      return `${type}:${skillId}:${moduleId}:${event.at || ''}`
  }
}

function moduleRecord(state, skillId, moduleId) {
  const key = `${skillId}:${moduleId}`
  return state.modules[key] || {
    skillId,
    moduleId,
    bkt: createBkt(),
    sm2: createCard(),
    hints: 0,
    failures: 0,
    completions: 0,
    lastScore: null,
  }
}

function skillRecord(state, skillId, pL0) {
  return state.skills[skillId] || createBkt({ pL0 })
}

function setModule(state, rec) {
  const key = `${rec.skillId}:${rec.moduleId}`
  return { ...state, modules: { ...state.modules, [key]: rec } }
}

function setSkill(state, skillId, bkt) {
  return { ...state, skills: { ...state.skills, [skillId]: bkt } }
}

function applyBinary(state, skillId, moduleId, correct, pL0) {
  const rec = moduleRecord(state, skillId, moduleId)
  rec.bkt = updateBkt(rec.bkt, correct)
  if (!correct) rec.failures = (rec.failures || 0) + 1
  state = setModule(state, rec)
  const skillBkt = updateBkt(skillRecord(state, skillId, pL0), correct)
  state = setSkill(state, skillId, skillBkt)
  return { state, rec }
}

function defaultPL0(state) {
  const level = state.memory?.effectiveLevel
  if (level === 'intermediate') return 0.35
  if (level === 'advanced') return 0.5
  return 0.2
}

/**
 * SynapSoul Brain — adaptive engine.
 * Algorithms are the default intelligence. Optional LLM is coach-only.
 */
export class AdaptiveEngine {
  constructor({ curriculum, state } = {}) {
    this.curriculum = curriculum || loadBundledCurriculum()
    this.state = cloneState(state || createState())
    if (!this.state.memory) this.state = { ...createState(), ...this.state }
  }

  observe(event) {
    if (!event?.type) return this.snapshot()
    const key = evidenceKey(event)
    if (hasProcessed(this.state, key)) {
      return this.snapshot()
    }

    this.state = markProcessed(this.state, key)
    this.state.eventCount = (this.state.eventCount || 0) + 1
    this.state.updatedAt = new Date().toISOString()

    const pL0 = defaultPL0(this.state)
    const skillId = event.skillId
    const moduleId = event.moduleId
    const payload = event.payload || {}

    switch (event.type) {
      case 'onboarding':
        this._onboarding(payload)
        break
      case 'pretest':
        this._pretest(payload)
        break
      case 'hint':
      case 'hint_used':
        this._hint(skillId, moduleId, payload, pL0)
        break
      case 'decide':
        this._decide(skillId, moduleId, payload, pL0)
        break
      case 'verify':
        this._verify(skillId, moduleId, payload, pL0)
        break
      case 'score':
      case 'module_complete':
        this._complete(skillId, moduleId, payload, pL0)
        break
      case 'session_step':
        this._step(skillId, moduleId, payload, pL0)
        break
      default:
        this.state = pushSignal(this.state, {
          kind: 'event',
          label: event.type,
          skillId,
          moduleId,
        })
    }

    this.state = refreshDerivedMemory(this.state, this.curriculum)
    return this.snapshot()
  }

  _onboarding(payload) {
    const track = payload.track || this.state.memory.preferredTrack || 'node'
    const level = payload.level || this.state.memory.effectiveLevel || 'beginner'
    this.state.memory.preferredTrack = track
    this.state.memory.effectiveLevel = level
    if (payload.confidence) this.state.memory.confidence = payload.confidence
    this.state = pushSignal(this.state, {
      kind: 'gain',
      label: `Calibrated to ${level} · ${track}`,
    })
  }

  _pretest(payload) {
    const score = payload.score ?? 0
    const total = payload.total || 5
    const answers = payload.answers || {}
    const key = this.curriculum.foundationSkill
    let skill = skillRecord(this.state, key, 0.2)
    if (payload.answers && typeof answers === 'object') {
      for (const [q, expected] of Object.entries({ 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A' })) {
        skill = updateBkt(skill, answers[q] === expected)
      }
    } else {
      for (let i = 0; i < total; i++) skill = updateBkt(skill, i < score)
    }
    this.state = setSkill(this.state, key, skill)
    const level = score >= 4 ? 'intermediate' : 'beginner'
    this.state.memory.effectiveLevel = payload.level || level
    this.state.memory.confidence = score >= 3 ? 'medium' : 'low'
    this.state = pushSignal(this.state, {
      kind: 'gain',
      label: `Pretest ${score}/${total} · ${this.state.memory.effectiveLevel}`,
    })
  }

  _hint(skillId, moduleId, payload, pL0) {
    if (!skillId || !moduleId) return
    const applied = applyBinary(this.state, skillId, moduleId, false, pL0)
    this.state = applied.state
    const rec = applied.rec
    rec.hints = (rec.hints || 0) + 1
    this.state = setModule(this.state, rec)
    this.state = rememberError(this.state, {
      type: 'hint',
      skillId,
      moduleId,
      step: payload.step,
    })
    this.state = pushSignal(this.state, {
      kind: 'hint',
      label: `Hint on ${moduleTitle(this.curriculum, skillId, moduleId)}`,
      skillId,
      moduleId,
    })
  }

  _decide(skillId, moduleId, payload, pL0) {
    this.state = updateDecisionPattern(this.state, payload.choice, payload.reasoning)
    const substantial = (payload.reasoning || '').trim().length >= 40
    if (skillId && moduleId) {
      const applied = applyBinary(this.state, skillId, moduleId, substantial, pL0)
      this.state = applied.state
    }
    this.state = pushSignal(this.state, {
      kind: substantial ? 'gain' : 'slip',
      label: `DECIDE ${payload.choice || '?'} · reasoning ${substantial ? 'specific' : 'thin'}`,
      skillId,
      moduleId,
    })
  }

  _verify(skillId, moduleId, payload, pL0) {
    if (!skillId || !moduleId) return
    const passed = payload.passed !== false && payload.passed !== 0
    const applied = applyBinary(this.state, skillId, moduleId, passed, pL0)
    this.state = applied.state
    if (!passed) {
      this.state = rememberError(this.state, { type: 'verify_fail', skillId, moduleId })
    }
    this.state = pushSignal(this.state, {
      kind: passed ? 'gain' : 'slip',
      label: passed ? `VERIFY passed · ${moduleTitle(this.curriculum, skillId, moduleId)}` : `VERIFY miss · ${moduleTitle(this.curriculum, skillId, moduleId)}`,
      skillId,
      moduleId,
    })
  }

  _complete(skillId, moduleId, payload, pL0) {
    if (!skillId || !moduleId) return
    const score = payload.score ?? payload.overall
    const hintsUsed = payload.hintsUsed || 0
    const correct = evidenceToCorrect({ score, hintsUsed, passed: payload.passed })
    const applied = applyBinary(this.state, skillId, moduleId, correct, pL0)
    this.state = applied.state
    const rec = applied.rec
    rec.completions = (rec.completions || 0) + 1
    rec.lastScore = typeof score === 'number' ? score : rec.lastScore
    rec.hints = Math.max(rec.hints || 0, hintsUsed)
    rec.sm2 = review(rec.sm2 || createCard(), scoreToQuality(score, hintsUsed))
    this.state = setModule(this.state, rec)

    const concepts = getModule(this.curriculum, skillId, moduleId)?.concepts || []
    if (correct && concepts.length) {
      const mastered = new Set(this.state.memory.conceptsMastered || [])
      concepts.forEach(c => mastered.add(c))
      this.state.memory.conceptsMastered = [...mastered]
    }
    if (!correct) {
      this.state = rememberError(this.state, { type: 'low_score', skillId, moduleId, score })
    }
    this.state = pushSignal(this.state, {
      kind: correct ? 'gain' : 'slip',
      label: `${moduleTitle(this.curriculum, skillId, moduleId)} scored ${score ?? 'n/a'}`,
      skillId,
      moduleId,
      delta: correct ? '+mastery' : 'slip',
    })
  }

  _step(skillId, moduleId, payload, pL0) {
    if (!skillId || !moduleId) return
    const step = payload.step
    if (step === 'VERIFY' && payload.passed === false) {
      this._verify(skillId, moduleId, payload, pL0)
      return
    }
    if (step === 'BUILD' || step === 'FIX') {
      const applied = applyBinary(this.state, skillId, moduleId, true, pL0)
      this.state = applied.state
    }
    this.state = pushSignal(this.state, {
      kind: 'step',
      label: `${step || 'step'} · ${moduleTitle(this.curriculum, skillId, moduleId)}`,
      skillId,
      moduleId,
    })
  }

  pKnow(skillId, moduleId) {
    if (moduleId) {
      const rec = this.state.modules[`${skillId}:${moduleId}`]
      if (rec?.bkt) return rec.bkt.pKnow
    }
    return this.state.skills[skillId]?.pKnow ?? 0.2
  }

  dueReviews(now = Date.now()) {
    return this.scheduledReviews(now).filter(r => r.dueNow)
  }

  scheduledReviews(now = Date.now()) {
    const out = []
    for (const rec of Object.values(this.state.modules || {})) {
      if (!rec.sm2?.due) continue
      const skill = getSkill(this.curriculum, rec.skillId)
      const mod = getModule(this.curriculum, rec.skillId, rec.moduleId)
      out.push({
        skillId: rec.skillId,
        moduleId: rec.moduleId,
        skillTitle: skill?.title || rec.skillId,
        moduleTitle: mod?.title || rec.moduleId,
        due: rec.sm2.due,
        interval: rec.sm2.interval,
        ease: rec.sm2.ef,
        dueNow: isDue(rec.sm2, now),
      })
    }
    return out.sort((a, b) => new Date(a.due) - new Date(b.due))
  }

  recommend() {
    const completed = completedSet(this.state)
    const due = this.dueReviews()
    const track = this.state.memory.preferredTrack || 'node'
    const candidates = []

    for (const skill of this.curriculum.skills) {
      const unlocked = isSkillUnlocked(this.curriculum, skill.id, completed)
      for (const mod of skill.modules) {
        const key = `${skill.id}:${mod.id}`
        const pKnow = this.pKnow(skill.id, mod.id)
        const ready = prereqReadiness(this.curriculum, skill.id, mod.id, k => {
          const [s, m] = k.split(':')
          return this.pKnow(s, m)
        })
        const done = completed.has(key)
        const rec = this.state.modules[key]
        const dueItem = due.find(d => d.skillId === skill.id && d.moduleId === mod.id)
        const trackMatch = (mod.tracks || []).includes(track) || (mod.tracks || []).includes('general')

        const zpd = 1 - Math.abs(pKnow - 0.45)
        let score = 0
        const reasons = []

        if (dueItem && done) {
          score += 0.55
          reasons.push(`spaced review due (${dueItem.interval}-day interval)`)
        } else if (done && pKnow >= 0.85) {
          score -= 0.4
        }

        if (!unlocked) {
          score -= 0.5
          reasons.push('locked until Launchpad is complete')
        } else {
          score += 0.12
        }

        score += 0.28 * zpd
        score += 0.22 * ready
        if (!done) {
          score += 0.18 * (1 - pKnow)
          reasons.push(pKnow < 0.4 ? 'low mastery — needs practice' : pKnow < 0.7 ? 'in the productive struggle zone' : 'consolidation')
        }
        if (ready < 0.35) {
          score -= 0.25
          reasons.push('prerequisites still weak')
        } else if (ready >= 0.6 && !done) {
          reasons.push('prerequisites look ready')
        }
        if (trackMatch) {
          score += 0.08
          reasons.push(`${track} track`)
        }
        if (mod.pack === 'launchpad') score += 0.05
        if (skill.startHere && !done) {
          score += 0.1
          reasons.push('foundation skill')
        }
        if ((rec?.hints || 0) >= 2 && !done) {
          score -= 0.06
          reasons.push('recent hint dependency')
        }
        if ((rec?.failures || 0) >= 2) {
          score -= 0.05
        }

        const difficulty = pKnow >= 0.7 ? 'easy' : pKnow >= 0.4 ? 'medium' : 'hard'
        candidates.push({
          skillId: skill.id,
          moduleId: mod.id,
          skillTitle: skill.title,
          moduleTitle: mod.title,
          pack: mod.pack,
          pKnow: round2(pKnow),
          score: round2(score),
          predictedDifficulty: difficulty,
          unlocked,
          completed: done,
          due: !!dueItem,
          reasons,
        })
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates.find(c => c.unlocked && (!c.completed || c.due)) || candidates[0] || null
    if (!best) {
      return {
        recommendedNext: null,
        why: 'No modules in the curriculum graph.',
        predictedDifficulty: null,
        candidates: [],
      }
    }

    const why = buildWhy(best)
    return {
      recommendedNext: {
        skillId: best.skillId,
        moduleId: best.moduleId,
        skillTitle: best.skillTitle,
        moduleTitle: best.moduleTitle,
        pack: best.pack,
        pKnow: best.pKnow,
      },
      why,
      predictedDifficulty: best.predictedDifficulty,
      candidates: candidates.slice(0, 8),
    }
  }

  snapshot() {
    const rec = this.recommend()
    const mastery = this.curriculum.skills.map(skill => {
      const bkt = this.state.skills[skill.id]
      const prior = 0.2
      const skillKnow = bkt?.pKnow ?? prior
      const mods = skill.modules.map(m => {
        const row = this.state.modules[`${skill.id}:${m.id}`]
        return {
          id: m.id,
          title: m.title,
          pKnow: round2(row?.bkt?.pKnow ?? (bkt?.observations ? skillKnow : prior)),
          hints: row?.hints || 0,
          completed: (row?.completions || 0) > 0,
        }
      })
      const avg = mods.length
        ? mods.reduce((s, m) => s + m.pKnow, 0) / mods.length
        : skillKnow
      return {
        id: skill.id,
        title: skill.title,
        color: skill.color,
        pKnow: round2(skillKnow),
        blended: round2(bkt?.observations ? 0.6 * skillKnow + 0.4 * avg : avg),
        observations: bkt?.observations || 0,
        modules: mods,
      }
    })

    return {
      version: this.state.version,
      updatedAt: this.state.updatedAt,
      eventCount: this.state.eventCount,
      mastery,
      recommendedNext: rec.recommendedNext,
      why: rec.why,
      predictedDifficulty: rec.predictedDifficulty,
      dueReviews: this.dueReviews(),
      upcomingReviews: this.scheduledReviews().slice(0, 6),
      strengths: this.state.memory.strengths,
      struggles: this.state.memory.struggles,
      hintDependency: this.state.memory.hintDependency,
      preferredPace: this.state.memory.preferredPace,
      preferredTrack: this.state.memory.preferredTrack,
      lastErrors: this.state.memory.lastErrors,
      decisionPatterns: this.state.memory.decisionPatterns,
      recentSignals: this.state.signals.slice(0, 8),
      conceptsMastered: this.state.memory.conceptsMastered,
      effectiveLevel: this.state.memory.effectiveLevel,
      coach: heuristicCoachNote({
        why: rec.why,
        moduleTitle: rec.recommendedNext?.moduleTitle,
        struggle: this.state.memory.struggles[0]?.title,
      }),
    }
  }
}

function completedSet(state) {
  const set = new Set()
  for (const [key, rec] of Object.entries(state.modules || {})) {
    if ((rec.completions || 0) > 0) set.add(key)
  }
  return set
}

function moduleTitle(curriculum, skillId, moduleId) {
  return getModule(curriculum, skillId, moduleId)?.title || moduleId || 'module'
}

function buildWhy(best) {
  const unique = []
  for (const r of best.reasons || []) {
    if (!unique.includes(r)) unique.push(r)
  }
  const head = `Next: ${best.moduleTitle} in ${best.skillTitle}`
  const detail = unique.slice(0, 3).join('; ')
  const diff = `Predicted difficulty: ${best.predictedDifficulty} (p(know)=${best.pKnow}).`
  return [head, detail, diff].filter(Boolean).join(' — ')
}

export function hydrateFromProgress(engine, progress) {
  if (!progress) return engine
  const { session, completedModules, decisions, scores, pretest, profile } = progress

  if (profile?.track || profile?.level) {
    engine.observe({
      type: 'onboarding',
      payload: { track: profile.track, level: profile.level },
    })
  }
  if (pretest?.submittedAt || pretest?.score != null) {
    engine.observe({ type: 'pretest', payload: pretest })
  }

  for (const [key, choice] of Object.entries(decisions || {})) {
    const [skillId, moduleId] = key.split(':')
    const reasoning = typeof choice === 'object' ? choice.reasoning : ''
    const letter = typeof choice === 'object' ? choice.choice : choice
    engine.observe({
      type: 'decide',
      skillId,
      moduleId,
      payload: { choice: letter, reasoning },
    })
  }

  for (const [key, mod] of Object.entries(completedModules || {})) {
    const [skillId, moduleId] = key.split(':')
    const scoreRow = scores?.[key] || {}
    engine.observe({
      type: 'module_complete',
      skillId,
      moduleId,
      payload: {
        score: mod.score ?? scoreRow.overall,
        overall: scoreRow.overall,
        hintsUsed: scoreRow.hintsUsed || 0,
        dimensions: scoreRow,
      },
    })
  }

  if (session?.skillId && session.hintsUsed > 0) {
    for (let n = 1; n <= session.hintsUsed; n++) {
      engine.observe({
        type: 'hint',
        skillId: session.skillId,
        moduleId: session.moduleId,
        payload: { n, step: session.step },
      })
    }
  }

  return engine
}

export function createEngine({ curriculum, state, progress } = {}) {
  const engine = new AdaptiveEngine({
    curriculum: curriculum || loadBundledCurriculum(),
    state,
  })
  if (progress) hydrateFromProgress(engine, progress)
  return engine
}
