import { createBkt, updateBkt } from './bkt.js'
import { createCard, review, isDue } from './sm2.js'
import { buildCurriculum } from './graph.js'
import { AdaptiveEngine, hydrateFromProgress, createEngine } from './AdaptiveEngine.js'
import { loadBundledCurriculum } from './curriculumData.js'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function testBkt() {
  let b = createBkt({ pL0: 0.2 })
  const start = b.pKnow
  for (let i = 0; i < 8; i++) b = updateBkt(b, true)
  assert(b.pKnow > start, 'correct evidence should raise p(know)')
  assert(b.pKnow > 0.7, 'eight successes should push mastery high')
  let low = createBkt({ pL0: 0.5 })
  const mid = low.pKnow
  low = updateBkt(low, false)
  assert(low.pKnow < mid, 'incorrect evidence should lower p(know)')
}

function testSm2() {
  let card = createCard()
  card = review(card, 5, Date.UTC(2026, 0, 1))
  assert(card.interval === 1, 'first success interval is 1 day')
  card = review(card, 5, Date.UTC(2026, 0, 2))
  assert(card.interval === 6, 'second success interval is 6 days')
  assert(isDue({ due: '2020-01-01T00:00:00.000Z' }, Date.now()), 'past due date is due')
  assert(!isDue({ due: '2099-01-01T00:00:00.000Z' }, Date.now()), 'future card is not due')
}

function testRecommend() {
  const engine = createEngine()
  const snap = engine.snapshot()
  assert(snap.recommendedNext?.skillId === 'system-design-fundamentals', 'empty student starts at foundation')
  assert(snap.recommendedNext?.moduleId === 'http-basics', 'first module is How the Web Works')
  assert(snap.why.includes('Next:'), 'why is human-readable')
}

function testObserveLearn() {
  const engine = new AdaptiveEngine({ curriculum: loadBundledCurriculum() })
  engine.observe({
    type: 'onboarding',
    payload: { track: 'python', level: 'beginner' },
  })
  engine.observe({
    type: 'module_complete',
    skillId: 'system-design-fundamentals',
    moduleId: 'http-basics',
    payload: { score: 5, hintsUsed: 0 },
  })
  const snap = engine.snapshot()
  assert(snap.preferredTrack === 'python', 'track preference stored')
  const sdf = snap.mastery.find(s => s.id === 'system-design-fundamentals')
  assert(sdf.pKnow > 0.2, 'completion raises skill mastery')
  const http = engine.state.modules['system-design-fundamentals:http-basics']
  assert(http?.sm2?.due, 'completed module schedules a review')
  assert(snap.upcomingReviews.length >= 1, 'upcoming reviews include the new card')
  assert(snap.recommendedNext.moduleId === 'data-persistence', 'next is persistence after http-basics')
}

function testHintsHurt() {
  const engine = createEngine()
  const before = engine.pKnow('system-design-fundamentals', 'http-basics')
  engine.observe({
    type: 'hint',
    skillId: 'system-design-fundamentals',
    moduleId: 'http-basics',
    payload: { n: 1 },
  })
  const after = engine.pKnow('system-design-fundamentals', 'http-basics')
  assert(after < before, 'hint is treated as scaffolding / slip')
  assert(engine.snapshot().hintDependency > 0, 'hint dependency rises')
}

function testHydrateIdempotent() {
  const progress = {
    profile: { track: 'node', level: 'beginner' },
    completedModules: {
      'system-design-fundamentals:http-basics': { score: 4, completedAt: '2026-01-01' },
    },
    scores: {
      'system-design-fundamentals:http-basics': { overall: 4, hintsUsed: 0 },
    },
    decisions: {},
    pretest: { score: 3, total: 5, answers: { 1: 'A', 2: 'A', 3: 'B', 4: 'A', 5: 'A' } },
    session: { skillId: 'system-design-fundamentals', moduleId: 'http-basics', hintsUsed: 2, step: 'CONTEXT' },
  }
  const engine = createEngine({ progress })
  const n = engine.state.eventCount
  const hints = engine.state.modules['system-design-fundamentals:http-basics']?.hints
  hydrateFromProgress(engine, progress)
  assert(engine.state.eventCount === n, 'hydrate must not double-count')
  assert(engine.state.modules['system-design-fundamentals:http-basics'].hints === hints, 'hints must not double-count')
}

function testGraph() {
  const c = loadBundledCurriculum()
  const http = c.byKey['system-design-fundamentals:http-basics']
  const persist = c.byKey['system-design-fundamentals:data-persistence']
  assert(http.prerequisites.length === 0, 'http-basics has no prereqs')
  assert(persist.prerequisites.includes('http-basics'), 'persistence follows http')
  const built = buildCurriculum({ foundationSkill: 'system-design-fundamentals', skills: CATALOG_STUB.skills }, CATALOG_STUB.manifests)
  assert(built.modules.length === 1, 'buildCurriculum uses provided manifests')
}

const CATALOG_STUB = {
  skills: [{ id: 'x', title: 'X', requiresFoundation: false }],
  manifests: [{ id: 'x', modules: [{ id: 'm1', title: 'M1' }] }],
}

function run() {
  testBkt()
  testSm2()
  testRecommend()
  testObserveLearn()
  testHintsHurt()
  testHydrateIdempotent()
  testGraph()
  console.log('brain tests passed')
}

run()
