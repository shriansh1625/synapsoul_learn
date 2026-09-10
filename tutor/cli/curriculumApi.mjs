import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { dataDir, defaultApiBase, PRODUCTION_API, isStandalone, ensureDir } from './paths.mjs'

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function isSafeId(value) {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
}

export async function refreshCurriculumFromApi({ apiBase } = {}) {
  const base = (apiBase || defaultApiBase() || PRODUCTION_API).replace(/\/$/, '')
  const res = await fetch(`${base}/api/curriculum`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Curriculum HTTP ${res.status}`)
  }
  const payload = await res.json()
  const catalog = payload.catalog
  if (!catalog?.skills) throw new Error('Curriculum response missing catalog.skills')

  const root = dataDir()
  ensureDir(root)
  writeJson(join(root, 'catalog.json'), catalog)

  if (payload.glossary) writeJson(join(root, 'glossary.json'), payload.glossary)
  if (payload.interludes) writeJson(join(root, 'interludes.json'), payload.interludes)

  for (const skill of payload.skills || []) {
    if (!isSafeId(skill.id)) continue
    const skillDir = join(root, 'skills', skill.id)
    const modulesDir = join(skillDir, 'modules')
    mkdirSync(modulesDir, { recursive: true })
    if (skill.manifest) writeJson(join(skillDir, 'manifest.json'), skill.manifest)
    for (const [moduleId, moduleJson] of Object.entries(skill.modules || {})) {
      if (!isSafeId(moduleId)) continue
      writeJson(join(modulesDir, `${moduleId}.json`), moduleJson)
    }
  }

  return { ok: true, api: base, skills: (payload.skills || []).length }
}

export async function ensureCurriculum() {
  const catalogPath = join(dataDir(), 'catalog.json')
  const hasLocal = existsSync(catalogPath)
  const shouldFetch = isStandalone() || process.env.SYNAPSOUL_REFRESH_CURRICULUM === '1' || process.env.LEARNLAB_REFRESH_CURRICULUM === '1'
  if (!shouldFetch && hasLocal) return { ok: true, source: 'local' }
  try {
    const result = await refreshCurriculumFromApi()
    return { ...result, source: 'api' }
  } catch (err) {
    if (hasLocal) return { ok: true, source: 'local-fallback', warning: err.message }
    throw err
  }
}
