import { readStore } from './localStore.js'
import { getPatternsForSkill, formatPatternsForPrompt } from './patterns.js'

function struggleTags(context) {
  const tags = []
  const struggles = context.brainSnapshot?.struggles || []
  for (const s of struggles.slice(0, 3)) {
    if (s.id) tags.push(s.id)
    if (s.title) tags.push(s.title.toLowerCase())
  }
  if (context.struggle) tags.push(String(context.struggle).toLowerCase())
  return tags
}

function scoreMatch(interaction, { skillId, moduleId, step, tags }) {
  let score = 0
  if (interaction.skill_id === skillId) score += 3
  if (interaction.module_id === moduleId) score += 2
  if (interaction.step === step) score += 2
  const ctxTags = interaction.context_json?.struggleTags || []
  for (const t of tags) {
    if (ctxTags.some(ct => String(ct).toLowerCase().includes(t))) score += 1
  }
  score += (interaction.composite_score || 0) * 2
  return score
}

export async function getFewShots(context = {}, mode = 'coach', limit = 3) {
  const interactions = readStore('interactions', [])
  const reactions = readStore('reactions', [])
  const fewShots = readStore('fewShots', [])

  const reactionByInteraction = new Map()
  for (const r of reactions) {
    const prev = reactionByInteraction.get(r.interaction_id)
    const score = r.implicit_score ?? (r.reaction === 'helpful' ? 1 : r.reaction === 'not_helpful' ? -0.5 : 0)
    if (!prev || score > prev) reactionByInteraction.set(r.interaction_id, score)
  }

  const tags = struggleTags(context)
  const { skillId, moduleId, step } = context

  const candidates = [...interactions, ...fewShots.map(f => ({ ...f, fromFewShotBank: true }))]
    .filter(i => i.type === mode && i.response_text)
    .map(i => {
      const rxScore = reactionByInteraction.get(i.id) ?? i.composite_score ?? 0
      return {
        ...i,
        composite_score: rxScore,
        matchScore: scoreMatch(i, { skillId, moduleId, step, tags }) + rxScore,
      }
    })
    .filter(i => i.composite_score > 0 || i.fromFewShotBank)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)

  const examples = candidates.map(c => ({
    type: c.type,
    context: c.context_json?.summary || `${c.skill_id}/${c.module_id} @ ${c.step}`,
    response: c.response_text,
    score: c.composite_score,
  }))

  const patterns = await getPatternsForSkill(skillId, mode)
  const patternBlock = formatPatternsForPrompt(patterns)

  return { examples, patterns, patternBlock }
}

export function formatFewShotsForPrompt({ examples, patternBlock }) {
  const parts = []
  if (patternBlock) parts.push(patternBlock)
  if (examples?.length) {
    const exLines = examples.map((e, i) =>
      `Example ${i + 1} (${e.type}, score ${e.score?.toFixed?.(1) ?? e.score}):\nContext: ${e.context}\nResponse: ${e.response}`
    )
    parts.push(`SynapSoul has learned these work well:\n${exLines.join('\n\n')}`)
  }
  return parts.join('\n\n')
}
