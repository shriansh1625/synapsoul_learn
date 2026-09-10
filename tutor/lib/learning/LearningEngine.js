import { complete, selectProvider } from '../llm/providers/index.js'
import { getExperienceStore } from './ExperienceStore.js'
import { upsertPattern } from './patterns.js'
import { readStore, writeStore, readMeta, writeMeta } from './localStore.js'

const CONSOLIDATE_EVERY = 10
const MODE_TO_CATEGORY = {
  coach: 'coach_tone',
  hint: 'hint_style',
  reflect: 'reflect_probe',
  decide: 'skill_specific',
}

function compositeScore(reactions) {
  if (!reactions.length) return 0
  let total = 0
  for (const r of reactions) {
    if (r.implicit_score != null) total += r.implicit_score
    else if (r.reaction === 'helpful') total += 1
    else if (r.reaction === 'not_helpful') total -= 0.5
  }
  return total / reactions.length
}

export class LearningEngine {
  constructor({ pool = null } = {}) {
    this.store = getExperienceStore(pool)
    this.pool = pool
  }

  async scoreInteractions() {
    const interactions = readStore('interactions', [])
    const reactions = readStore('reactions', [])
    const byInteraction = new Map()
    for (const r of reactions) {
      if (!byInteraction.has(r.interaction_id)) byInteraction.set(r.interaction_id, [])
      byInteraction.get(r.interaction_id).push(r)
    }

    const scored = interactions.map(i => ({
      ...i,
      composite_score: compositeScore(byInteraction.get(i.id) || []),
      reactionCount: (byInteraction.get(i.id) || []).length,
    }))
    writeStore('interactions', scored)
    return scored.filter(s => s.composite_score > 0.5)
  }

  async promoteToFewShotBank(threshold = 0.7) {
    const scored = await this.scoreInteractions()
    const fewShots = readStore('fewShots', [])
    const existingIds = new Set(fewShots.map(f => f.id))

    for (const item of scored) {
      if (item.composite_score < threshold || existingIds.has(item.id)) continue
      fewShots.push({
        id: item.id,
        type: item.type,
        skill_id: item.skill_id,
        module_id: item.module_id,
        step: item.step,
        context_json: item.context_json,
        response_text: item.response_text,
        composite_score: item.composite_score,
        promoted_at: new Date().toISOString(),
      })
      existingIds.add(item.id)
    }

    writeStore('fewShots', fewShots.slice(-500))
    return fewShots.length
  }

  async consolidatePatterns({ skillId = null, type = 'hint' } = {}) {
    const interactions = readStore('interactions', [])
    const reactions = readStore('reactions', [])
    const byInteraction = new Map()
    for (const r of reactions) byInteraction.set(r.interaction_id, r)

    const successful = interactions
      .filter(i => {
        if (skillId && i.skill_id !== skillId) return false
        if (type && i.type !== type) return false
        const r = byInteraction.get(i.id)
        const score = r?.implicit_score ?? (r?.reaction === 'helpful' ? 1 : 0)
        return score >= 0.5
      })
      .slice(-15)

    if (successful.length < 3) {
      return { ok: false, reason: 'insufficient_successful_interactions', count: successful.length }
    }

    const category = MODE_TO_CATEGORY[type] || 'skill_specific'
    const examples = successful.map((s, i) =>
      `${i + 1}. [${s.skill_id}/${s.module_id} step ${s.step}] ${s.response_text}`
    ).join('\n')

    const skillLabel = skillId || 'general'
    const metaPrompt = `You are the SynapSoul meta-learner. Given these successful ${type} interactions for skill "${skillLabel}", distill exactly 3 concise rules for future ${type} responses. Each rule one sentence. No markdown bullets — return JSON: {"rules":["rule1","rule2","rule3"]}`

    let rules = []
    try {
      const text = await complete({
        messages: [
          { role: 'system', content: metaPrompt },
          { role: 'user', content: examples },
        ],
        maxTokens: 300,
        temperature: 0.3,
        json: true,
        timeoutMs: 8000,
      })
      const parsed = JSON.parse(text)
      rules = parsed.rules || []
    } catch {
      rules = [
        `Keep ${type} responses short and step-focused.`,
        `Reference the student's current step without revealing BUILD solutions.`,
        `Tie guidance to evidence and verification when possible.`,
      ]
    }

    for (const rule of rules) {
      await this._savePattern({
        category,
        skillId,
        patternText: rule,
        evidenceCount: successful.length,
        successRate: 0.8,
        metadata: { type, consolidatedAt: new Date().toISOString() },
      })
    }

    const meta = readMeta()
    meta.lastConsolidation = new Date().toISOString()
    writeMeta(meta)

    await this.promoteToFewShotBank()
    return { ok: true, rules, count: successful.length }
  }

  async _savePattern({ category, skillId, patternText, evidenceCount, successRate, metadata }) {
    if (this.pool) {
      try {
        const { rows } = await this.pool.query(
          `SELECT id FROM llm_learned_patterns
           WHERE category = $1 AND skill_id IS NOT DISTINCT FROM $2 AND pattern_text = $3`,
          [category, skillId, patternText]
        )
        if (rows[0]) {
          await this.pool.query(
            `UPDATE llm_learned_patterns
             SET evidence_count = $1, success_rate = $2, last_updated = NOW(), metadata_json = $3::jsonb
             WHERE id = $4`,
            [evidenceCount, successRate, JSON.stringify(metadata), rows[0].id]
          )
        } else {
          await this.pool.query(
            `INSERT INTO llm_learned_patterns (category, skill_id, pattern_text, evidence_count, success_rate, metadata_json)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
            [category, skillId, patternText, evidenceCount, successRate, JSON.stringify(metadata)]
          )
        }
      } catch {
        /* local fallback */
      }
    }
    upsertPattern({ category, skillId, patternText, evidenceCount, successRate, metadata })
  }

  async maybeConsolidateAfterReaction() {
    const meta = readMeta()
    const count = meta.reactionCount || 0
    if (count > 0 && count % CONSOLIDATE_EVERY === 0) {
      return this.consolidatePatterns({})
    }
    return null
  }
}

let defaultEngine = null

export function getLearningEngine(pool = null) {
  if (!defaultEngine || (pool && !defaultEngine.pool)) {
    defaultEngine = new LearningEngine({ pool })
  }
  return defaultEngine
}

export function getActiveProvider() {
  if (selectProvider()?.name) return 'groq'
  if (process.env.GROQ_API_KEY) return 'groq'
  if (process.env.OPENAI_API_KEY) return 'openai'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'heuristic'
}

export function getActiveModel() {
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
}
