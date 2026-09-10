import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

function learnlabHome() {
  const fromEnv = process.env.SYNAPSOUL_HOME || process.env.LEARNLAB_HOME
  if (fromEnv) return fromEnv
  const syn = join(homedir(), '.synapsoul')
  const legacy = join(homedir(), '.learnlab')
  if (existsSync(syn)) return syn
  if (existsSync(legacy)) return legacy
  return syn
}

export function learnerDir() {
  const fromEnv = process.env.SYNAPSOUL_LEARNER_DIR
  if (fromEnv) return fromEnv
  return join(learnlabHome(), 'learner')
}

const FILES = {
  profileDigest: 'student_profile_digest.json',
  patterns: 'learned_patterns_local.json',
  chunks: 'interaction_chunks.jsonl',
  meta: 'meta.json',
  graph: 'graph.json',
}

function ensureDir() {
  const dir = learnerDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function filePath(name) {
  return join(ensureDir(), FILES[name] || name)
}

export function readLearnerJson(name, fallback = {}) {
  const path = filePath(name)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeLearnerJson(name, data) {
  writeFileSync(filePath(name), JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function appendChunk(record) {
  const line = JSON.stringify({ ...record, at: record.at || new Date().toISOString() })
  appendFileSync(filePath('chunks'), line + '\n', 'utf8')
}

export function readChunks(limit = 500) {
  const path = filePath('chunks')
  if (!existsSync(path)) return []
  try {
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
    const slice = lines.length > limit ? lines.slice(-limit) : lines
    return slice.map(l => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

export function readLearnerMeta() {
  return readLearnerJson('meta', {
    observeCount: 0,
    lastObserve: null,
    lastConsolidation: null,
    consolidationSource: null,
  })
}

export function writeLearnerMeta(meta) {
  writeLearnerJson('meta', meta)
}
