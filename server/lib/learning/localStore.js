import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CANDIDATE_DIRS = [
  join(__dirname, '..', '..', 'data', 'sync', 'learning'),
  join(__dirname, '..', '..', '..', 'tutor', 'data', 'sync', 'learning'),
  join(__dirname, '..', '..', 'data', 'sync', 'learning'),
]

function resolveLearningDir() {
  for (const dir of CANDIDATE_DIRS) {
    const parent = dirname(dir)
    if (existsSync(parent) || dir.includes('sync')) return dir
  }
  return CANDIDATE_DIRS[0]
}

export const LEARNING_DIR = resolveLearningDir()

const FILES = {
  interactions: 'interactions.json',
  reactions: 'reactions.json',
  patterns: 'patterns.json',
  fewShots: 'few_shots.json',
  meta: 'meta.json',
}

function ensureDir() {
  if (!existsSync(LEARNING_DIR)) mkdirSync(LEARNING_DIR, { recursive: true })
}

function filePath(name) {
  return join(LEARNING_DIR, FILES[name] || name)
}

export function readStore(name, fallback = []) {
  ensureDir()
  const path = filePath(name)
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeStore(name, data) {
  ensureDir()
  writeFileSync(filePath(name), JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function newId() {
  return randomUUID()
}

export function readMeta() {
  return readStore('meta', { reactionCount: 0, lastConsolidation: null })
}

export function writeMeta(meta) {
  writeStore('meta', meta)
}
