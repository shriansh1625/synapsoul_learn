/**
 * Curriculum graph from catalog + skill manifests.
 * Does not invent modules — only wires existing JSON into a skill/module graph.
 */

export function buildCurriculum(catalog, manifests) {
  const manifestById = {}
  for (const m of manifests || []) {
    if (m?.id) manifestById[m.id] = m
  }

  const modules = []
  const byKey = {}
  const skills = []

  for (const skill of catalog?.skills || []) {
    const manifest = manifestById[skill.id]
    if (!manifest) continue
    const skillModules = (manifest.modules || []).map((m, i) => {
      const prev = i > 0 ? manifest.modules[i - 1] : null
      const prereqs = Array.isArray(m.prerequisites) && m.prerequisites.length
        ? m.prerequisites
        : prev
          ? [prev.id]
          : []
      const node = {
        id: m.id,
        skillId: skill.id,
        title: m.title,
        pack: m.pack || 'launchpad',
        concepts: m.concepts || [],
        duration: m.duration || null,
        prerequisites: prereqs,
        tracks: manifest.tracks || skill.tracks || [],
      }
      const key = `${skill.id}:${m.id}`
      modules.push(node)
      byKey[key] = node
      byKey[m.id] = node
      return node
    })
    skills.push({
      id: skill.id,
      title: skill.title,
      description: skill.description,
      requiresFoundation: !!skill.requiresFoundation,
      startHere: !!skill.startHere,
      color: skill.color,
      growthDimensions: skill.growthDimensions || [],
      moduleCount: skillModules.length,
      tracks: manifest.tracks || skill.tracks || [],
      modules: skillModules,
    })
  }

  return {
    foundationSkill: catalog?.foundationSkill || 'system-design-fundamentals',
    tracks: catalog?.tracks || [],
    skills,
    modules,
    byKey,
  }
}

export function getSkill(curriculum, skillId) {
  return curriculum.skills.find(s => s.id === skillId) || null
}

export function getModule(curriculum, skillId, moduleId) {
  if (skillId && moduleId) return curriculum.byKey[`${skillId}:${moduleId}`] || curriculum.byKey[moduleId] || null
  return curriculum.byKey[moduleId] || null
}

export function launchpadModules(curriculum) {
  const foundation = getSkill(curriculum, curriculum.foundationSkill)
  if (!foundation) return []
  return foundation.modules.filter(m => m.pack === 'launchpad')
}

export function isSkillUnlocked(curriculum, skillId, completedKeys) {
  const skill = getSkill(curriculum, skillId)
  if (!skill) return false
  if (!skill.requiresFoundation) return true
  const done = completedKeys || new Set()
  return launchpadModules(curriculum).every(m => done.has(`${curriculum.foundationSkill}:${m.id}`))
}

export function prereqKeys(curriculum, skillId, moduleId) {
  const mod = getModule(curriculum, skillId, moduleId)
  if (!mod) return []
  return (mod.prerequisites || []).map(pid => {
    if (pid.includes(':')) return pid
    const sameSkill = curriculum.byKey[`${skillId}:${pid}`]
    if (sameSkill) return `${skillId}:${pid}`
    const found = curriculum.modules.find(x => x.id === pid)
    return found ? `${found.skillId}:${found.id}` : `${skillId}:${pid}`
  })
}

export function prereqReadiness(curriculum, skillId, moduleId, pKnowOf) {
  const keys = prereqKeys(curriculum, skillId, moduleId)
  if (!keys.length) return 1
  const values = keys.map(k => {
    const p = pKnowOf(k)
    return typeof p === 'number' ? p : 0.2
  })
  return values.reduce((a, b) => a + b, 0) / values.length
}
