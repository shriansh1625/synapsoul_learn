const modules = import.meta.glob('../data/skills/*/modules/*.json')

export async function loadModuleJson(skillId, moduleId) {
  const key = `../data/skills/${skillId}/modules/${moduleId}.json`
  const loader = modules[key]
  if (!loader) return null
  const mod = await loader()
  return mod.default || mod
}
