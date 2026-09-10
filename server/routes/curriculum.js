import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Router } from 'express'

const router = Router()
const __dirname = dirname(fileURLToPath(import.meta.url))

const SAFE_ID = /^[a-z0-9-]+$/

function resolveDataDir() {
  const candidates = [
    join(__dirname, '..', 'data'),
    join(__dirname, '..', '..', 'tutor', 'data'),
  ]
  return candidates.find(dir => existsSync(join(dir, 'catalog.json'))) || null
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadCatalog(dataDir) {
  return readJson(join(dataDir, 'catalog.json'))
}

function loadOptional(dataDir, name, fallback) {
  const path = join(dataDir, name)
  if (!existsSync(path)) return fallback
  return readJson(path)
}

function loadManifest(dataDir, skillId) {
  const path = join(dataDir, 'skills', skillId, 'manifest.json')
  if (!existsSync(path)) return null
  return readJson(path)
}

function loadModule(dataDir, skillId, moduleId) {
  const path = join(dataDir, 'skills', skillId, 'modules', `${moduleId}.json`)
  if (!existsSync(path)) return null
  return readJson(path)
}

function listModuleIds(dataDir, skillId) {
  const dir = join(dataDir, 'skills', skillId, 'modules')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => name.replace(/\.json$/, ''))
}

function withData(req, res, fn) {
  const dataDir = resolveDataDir()
  if (!dataDir) {
    return res.status(503).json({ error: 'Curriculum data is not available on this API' })
  }
  try {
    return fn(dataDir)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to read curriculum' })
  }
}

router.get('/', (req, res) => {
  withData(req, res, dataDir => {
    const catalog = loadCatalog(dataDir)
    const skills = (catalog.skills || []).map(skill => {
      const manifest = loadManifest(dataDir, skill.id)
      const moduleIds = manifest?.modules?.map(m => m.id) || listModuleIds(dataDir, skill.id)
      const modules = {}
      for (const moduleId of moduleIds) {
        const mod = loadModule(dataDir, skill.id, moduleId)
        if (mod) modules[moduleId] = mod
      }
      return {
        id: skill.id,
        title: skill.title,
        manifest,
        modules,
      }
    })
    res.json({
      catalog,
      skills,
      glossary: loadOptional(dataDir, 'glossary.json', []),
      interludes: loadOptional(dataDir, 'interludes.json', []),
    })
  })
})

router.get('/skills', (req, res) => {
  withData(req, res, dataDir => {
    const catalog = loadCatalog(dataDir)
    const skills = (catalog.skills || []).map(skill => {
      const manifest = loadManifest(dataDir, skill.id)
      return {
        id: skill.id,
        title: skill.title,
        description: skill.description,
        requiresFoundation: skill.requiresFoundation || false,
        startHere: skill.startHere || false,
        moduleCount: manifest?.modules?.length || skill.moduleCount || 0,
        modules: (manifest?.modules || []).map(m => ({ id: m.id, title: m.title, pack: m.pack })),
      }
    })
    res.json({
      foundationSkill: catalog.foundationSkill,
      tracks: catalog.tracks || [],
      headlineDimensions: catalog.headlineDimensions || [],
      skills,
    })
  })
})

router.get('/:skillId/:moduleId', (req, res) => {
  const { skillId, moduleId } = req.params
  if (!SAFE_ID.test(skillId) || !SAFE_ID.test(moduleId)) {
    return res.status(400).json({ error: 'Invalid skill or module id' })
  }
  withData(req, res, dataDir => {
    const moduleJson = loadModule(dataDir, skillId, moduleId)
    if (!moduleJson) return res.status(404).json({ error: `Module not found: ${skillId}/${moduleId}` })
    res.json(moduleJson)
  })
})

router.get('/:skillId', (req, res) => {
  const { skillId } = req.params
  if (!SAFE_ID.test(skillId)) {
    return res.status(400).json({ error: 'Invalid skill id' })
  }
  withData(req, res, dataDir => {
    const catalog = loadCatalog(dataDir)
    const skill = (catalog.skills || []).find(s => s.id === skillId)
    const manifest = loadManifest(dataDir, skillId)
    if (!skill && !manifest) return res.status(404).json({ error: `Skill not found: ${skillId}` })
    const moduleIds = manifest?.modules?.map(m => m.id) || listModuleIds(dataDir, skillId)
    const modules = {}
    for (const moduleId of moduleIds) {
      const mod = loadModule(dataDir, skillId, moduleId)
      if (mod) modules[moduleId] = mod
    }
    res.json({
      id: skillId,
      skill: skill || null,
      manifest,
      modules,
    })
  })
})

export default router
