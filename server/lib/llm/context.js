import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSkill, getModule } from '../brain/graph.js'
import { loadBundledCurriculum } from '../brain/curriculumData.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_ROOTS = [
  join(__dirname, '..', '..', 'data'),
  join(__dirname, '..', '..', '..', 'tutor', 'data'),
]

function tryLoadModuleJson(skillId, moduleId) {
  if (!skillId || !moduleId) return null
  const rel = join('skills', skillId, 'modules', `${moduleId}.json`)
  const path = DATA_ROOTS.map(root => join(root, rel)).find(p => existsSync(p))
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function excerptStep(stepData, step, track) {
  if (!stepData || typeof stepData !== 'object') return null
  const out = { step }
  if (stepData.content) out.content = stepData.content
  if (stepData.goal) out.goal = stepData.goal
  if (stepData.criteria) out.criteria = stepData.criteria
  if (stepData.optionA) out.optionA = stepData.optionA
  if (stepData.optionB) out.optionB = stepData.optionB
  if (stepData.tradeoffs) out.tradeoffs = stepData.tradeoffs
  if (stepData.hints) out.hints = stepData.hints
  if (stepData.tracks?.[track]) out.trackGoal = stepData.tracks[track]
  return out
}

function profileExcerpt(profile) {
  if (!profile) return null
  return {
    name: profile.name || undefined,
    track: profile.track || undefined,
    degree: profile.degree || undefined,
    level: profile.level || undefined,
  }
}

function brainExcerpt(snapshot) {
  if (!snapshot) return null
  return {
    why: snapshot.why,
    predictedDifficulty: snapshot.predictedDifficulty,
    preferredPace: snapshot.preferredPace,
    hintDependency: snapshot.hintDependency,
    struggles: (snapshot.struggles || []).slice(0, 2).map(s => s.title || s.id),
    recommendedNext: snapshot.recommendedNext
      ? {
          skillId: snapshot.recommendedNext.skillId,
          moduleId: snapshot.recommendedNext.moduleId,
          moduleTitle: snapshot.recommendedNext.moduleTitle,
        }
      : undefined,
    recentSignals: (snapshot.recentSignals || []).slice(0, 4).map(s => s.label),
  }
}

/**
 * Build prompt context from session, brain snapshot, profile, and curriculum.
 * Accepts inline module/step data when filesystem curriculum is unavailable (e.g. Render API).
 */
export function buildPromptContext({
  skillId,
  moduleId,
  step,
  track,
  event,
  brainSnapshot,
  profile,
  moduleJson,
  stepContent,
  hintText,
  hintsUsed,
  decision,
  why,
  struggle,
} = {}) {
  const curriculum = loadBundledCurriculum()
  const skill = skillId ? getSkill(curriculum, skillId) : null
  const modMeta = skillId && moduleId ? getModule(curriculum, skillId, moduleId) : null

  const module = moduleJson || tryLoadModuleJson(skillId, moduleId)
  const stepData = stepContent || (module?.steps?.[step] ?? null)
  const excerpt = excerptStep(stepData, step, track)

  const lines = [
    '# SynapSoul session context',
    skill ? `Skill: ${skill.title} (${skillId})` : skillId ? `Skill: ${skillId}` : '',
    modMeta ? `Module: ${modMeta.title} (${moduleId})` : module?.title ? `Module: ${module.title}` : '',
    step ? `Current step: ${step}` : '',
    track ? `Track: ${track}` : '',
    event?.type ? `Event: ${event.type}` : '',
    why ? `Brain policy: ${why}` : '',
    struggle ? `Struggle focus: ${struggle}` : '',
    typeof hintsUsed === 'number' ? `Hints used this module: ${hintsUsed}` : '',
    hintText ? `Curriculum hint: ${hintText}` : '',
    decision ? `DECIDE choice: ${decision.choice || '—'} — ${decision.reasoning || ''}` : '',
  ].filter(Boolean)

  const prof = profileExcerpt(profile)
  if (prof) lines.push('', '## Student profile', JSON.stringify(prof, null, 2))

  const brain = brainExcerpt(brainSnapshot)
  if (brain) lines.push('', '## Brain snapshot', JSON.stringify(brain, null, 2))

  if (excerpt) lines.push('', '## Step excerpt (from curriculum)', JSON.stringify(excerpt, null, 2))

  return lines.join('\n')
}
