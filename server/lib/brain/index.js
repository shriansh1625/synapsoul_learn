/** Copied from tutor/lib/brain for Render (rootDir: server). Keep both trees in sync. */
/** LLM overlay: server/lib/llm — keep in sync with tutor/lib/llm. */
export { DEFAULT_BKT, createBkt, updateBkt, pCorrect, evidenceToCorrect } from './bkt.js'
export { createCard, review, isDue, scoreToQuality } from './sm2.js'
export {
  buildCurriculum,
  getSkill,
  getModule,
  launchpadModules,
  isSkillUnlocked,
  prereqKeys,
  prereqReadiness,
} from './graph.js'
export { loadBundledCurriculum, SKILL_MANIFESTS } from './curriculumData.js'
export {
  createState,
  cloneState,
  emptyMemory,
  mergeStates,
  refreshDerivedMemory,
} from './memory.js'
export { heuristicCoachNote } from './coach.js'
export { AdaptiveEngine, hydrateFromProgress, createEngine } from './AdaptiveEngine.js'
