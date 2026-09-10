import { readChunks } from './learnerStore.js'

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it', 'this', 'that',
  'with', 'as', 'at', 'by', 'from', 'your', 'you', 'be', 'are', 'was', 'were', 'step',
])

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
}

/**
 * Lightweight keyword retrieval over local interaction chunks (no embedding deps).
 */
export function retrieveChunks(query, { limit = 5, skillId, moduleId } = {}) {
  const qTokens = new Set(tokenize(query))
  if (!qTokens.size) return []

  const chunks = readChunks(800)
  const scored = chunks
    .filter(c => {
      if (skillId && c.skill_id && c.skill_id !== skillId) return false
      if (moduleId && c.module_id && c.module_id !== moduleId) return false
      return true
    })
    .map(c => {
      const doc = [c.summary, c.text, c.skill_id, c.module_id, c.step, ...(c.tags || [])].join(' ')
      const dTokens = tokenize(doc)
      let overlap = 0
      for (const t of dTokens) {
        if (qTokens.has(t)) overlap++
      }
      const tf = overlap / Math.max(dTokens.length, 1)
      return { chunk: c, score: overlap + tf }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(s => s.chunk)
}

export function formatRetrievedChunks(chunks) {
  if (!chunks?.length) return ''
  const lines = chunks.map((c, i) =>
    `${i + 1}. [${c.kind || 'event'}] ${c.summary || ''}${c.text ? ` — ${c.text}` : ''}`
  )
  return `SynapSoul Local Learner (from your bootcamp activity):\n${lines.join('\n')}`
}
