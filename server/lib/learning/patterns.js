import { pool } from '../../db/pool.js'
import { readStore, writeStore, newId } from './localStore.js'

const MODE_TO_CATEGORY = {
  coach: 'coach_tone',
  hint: 'hint_style',
  reflect: 'reflect_probe',
  decide: 'skill_specific',
}

export async function getPatternsForSkill(skillId, mode = null) {
  const category = mode ? MODE_TO_CATEGORY[mode] : null
  let patterns = []

  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM llm_learned_patterns
         WHERE ($1::text IS NULL OR skill_id IS NULL OR skill_id = $1)
         ORDER BY success_rate DESC, evidence_count DESC
         LIMIT 20`,
        [skillId || null]
      )
      patterns = rows.map(r => ({
        id: r.id,
        category: r.category,
        skill_id: r.skill_id,
        pattern_text: r.pattern_text,
        evidence_count: r.evidence_count,
        success_rate: r.success_rate,
        last_updated: r.last_updated,
        metadata_json: r.metadata_json,
      }))
    } catch {
      patterns = readStore('patterns', [])
    }
  } else {
    patterns = readStore('patterns', [])
  }

  return patterns
    .filter(p => {
      if (category && p.category !== category && p.category !== 'skill_specific') return false
      if (skillId && p.skill_id && p.skill_id !== skillId) return false
      return true
    })
    .sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))
    .slice(0, 5)
}

export function upsertPattern({ category, skillId, patternText, evidenceCount, successRate, metadata = {} }) {
  const patterns = readStore('patterns', [])
  const existing = patterns.find(
    p => p.category === category && p.skill_id === skillId && p.pattern_text === patternText
  )
  if (existing) {
    existing.evidence_count = evidenceCount ?? existing.evidence_count
    existing.success_rate = successRate ?? existing.success_rate
    existing.last_updated = new Date().toISOString()
    existing.metadata_json = { ...existing.metadata_json, ...metadata }
  } else {
    patterns.push({
      id: newId(),
      category,
      skill_id: skillId || null,
      pattern_text: patternText,
      evidence_count: evidenceCount || 1,
      success_rate: successRate || 0,
      last_updated: new Date().toISOString(),
      metadata_json: metadata,
    })
  }
  writeStore('patterns', patterns)
}

export function formatPatternsForPrompt(patterns) {
  if (!patterns?.length) return ''
  const lines = patterns.map((p, i) => `${i + 1}. ${p.pattern_text}`)
  return `LearnLab has learned these patterns work well:\n${lines.join('\n')}`
}
