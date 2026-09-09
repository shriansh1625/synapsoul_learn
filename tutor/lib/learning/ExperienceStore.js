import { createHash } from 'crypto'
import { readStore, writeStore, newId, readMeta, writeMeta } from './localStore.js'

function hashPrompt(text) {
  return createHash('sha256').update(text || '').digest('hex').slice(0, 16)
}

function summarizeContext(context) {
  const struggles = (context.brainSnapshot?.struggles || []).map(s => s.id || s.title).filter(Boolean)
  return {
    summary: [context.skillId, context.moduleId, context.step].filter(Boolean).join(' / '),
    struggleTags: struggles,
    hintsUsed: context.hintsUsed,
    why: context.why,
  }
}

export class ExperienceStore {
  constructor({ pool = null } = {}) {
    this.pool = pool
  }

  async logInteraction({
    userId = null,
    type,
    skillId,
    moduleId,
    step,
    context = {},
    promptText = '',
    responseText = '',
    provider = null,
    model = null,
    source = 'llm',
  }) {
    const id = newId()
    const promptHash = hashPrompt(promptText)
    const contextJson = { ...summarizeContext(context), source }

    const row = {
      id,
      user_id: userId,
      type,
      skill_id: skillId || null,
      module_id: moduleId || null,
      step: step || null,
      context_json: contextJson,
      prompt_hash: promptHash,
      response_text: responseText,
      provider,
      model,
      created_at: new Date().toISOString(),
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO llm_interactions
           (id, user_id, type, skill_id, module_id, step, context_json, prompt_hash, response_text, provider, model)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
          [id, userId, type, skillId, moduleId, step, JSON.stringify(contextJson), promptHash, responseText, provider, model]
        )
      } catch {
        /* fall through to local */
      }
    }

    const interactions = readStore('interactions', [])
    interactions.push(row)
    if (interactions.length > 2000) interactions.splice(0, interactions.length - 2000)
    writeStore('interactions', interactions)

    return id
  }

  async logReaction({ interactionId, userId = null, reaction = null, implicitScore = null, signalJson = {} }) {
    const id = newId()
    const row = {
      id,
      interaction_id: interactionId,
      user_id: userId,
      reaction,
      implicit_score: implicitScore,
      signal_json: signalJson,
      created_at: new Date().toISOString(),
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO llm_reactions (id, interaction_id, user_id, reaction, implicit_score, signal_json)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [id, interactionId, userId, reaction, implicitScore, JSON.stringify(signalJson)]
        )
      } catch {
        /* local fallback */
      }
    }

    const reactions = readStore('reactions', [])
    reactions.push(row)
    if (reactions.length > 5000) reactions.splice(0, reactions.length - 5000)
    writeStore('reactions', reactions)

    const meta = readMeta()
    meta.reactionCount = (meta.reactionCount || 0) + 1
    writeMeta(meta)

    return { id, reactionCount: meta.reactionCount }
  }

  async querySimilarExperiences({ skillId, moduleId, step, struggleTags = [], limit = 10, minScore = 0.3 }) {
    const interactions = readStore('interactions', [])
    const reactions = readStore('reactions', [])

    const scores = new Map()
    for (const r of reactions) {
      const s = r.implicit_score ?? (r.reaction === 'helpful' ? 1 : r.reaction === 'not_helpful' ? -0.5 : 0)
      const prev = scores.get(r.interaction_id) || 0
      scores.set(r.interaction_id, Math.max(prev, s))
    }

    return interactions
      .filter(i => {
        if (skillId && i.skill_id !== skillId) return false
        const sc = scores.get(i.id) ?? 0
        return sc >= minScore
      })
      .map(i => ({
        ...i,
        composite_score: scores.get(i.id) ?? 0,
        tagOverlap: (i.context_json?.struggleTags || []).filter(t =>
          struggleTags.some(st => String(t).toLowerCase().includes(String(st).toLowerCase()))
        ).length,
      }))
      .sort((a, b) => {
        let sa = a.composite_score
        let sb = b.composite_score
        if (a.module_id === moduleId) sa += 0.5
        if (b.module_id === moduleId) sb += 0.5
        if (a.step === step) sa += 0.3
        if (b.step === step) sb += 0.3
        sa += a.tagOverlap * 0.2
        sb += b.tagOverlap * 0.2
        return sb - sa
      })
      .slice(0, limit)
  }

  async getStats() {
    const interactions = readStore('interactions', [])
    const reactions = readStore('reactions', [])
    const patterns = readStore('patterns', [])
    const meta = readMeta()

    let helpful = 0
    let notHelpful = 0
    for (const r of reactions) {
      if (r.reaction === 'helpful') helpful++
      if (r.reaction === 'not_helpful') notHelpful++
    }
    const explicitTotal = helpful + notHelpful
    const successRate = explicitTotal ? helpful / explicitTotal : null

    if (this.pool) {
      try {
        const { rows: pRows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM llm_learned_patterns')
        const { rows: iRows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM llm_interactions')
        return {
          interactions: iRows[0]?.n ?? interactions.length,
          reactions: reactions.length,
          patterns: pRows[0]?.n ?? patterns.length,
          helpful,
          notHelpful,
          successRate,
          lastConsolidation: meta.lastConsolidation,
          recentPatterns: patterns.slice(-3).map(p => p.pattern_text),
          source: 'postgres+local',
        }
      } catch {
        /* local only */
      }
    }

    return {
      interactions: interactions.length,
      reactions: reactions.length,
      patterns: patterns.length,
      helpful,
      notHelpful,
      successRate,
      lastConsolidation: meta.lastConsolidation,
      recentPatterns: patterns.slice(-3).map(p => p.pattern_text),
      source: 'local',
    }
  }
}

let defaultStore = null

export function getExperienceStore(pool = null) {
  if (!defaultStore || (pool && !defaultStore.pool)) {
    defaultStore = new ExperienceStore({ pool })
  }
  return defaultStore
}
