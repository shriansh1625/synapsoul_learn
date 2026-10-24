import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import catalog from '../../data/catalog.json'
import { AdaptiveEngine, hydrateFromProgress, mergeStates, buildCurriculum } from '../../lib/brain/index.js'
import { SKILL_MANIFESTS } from '../../lib/brain/curriculumData.js'
import { canSyncProgress, fetchBrain, putBrain, observeBrain } from '../api.js'

const BRAIN_KEY = 'synapsoul-brain-v2'

function webCurriculum() {
  return buildCurriculum(catalog, SKILL_MANIFESTS)
}

function loadLocal(scope) {
  try {
    const raw = localStorage.getItem(`${BRAIN_KEY}:${scope}`)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveLocal(state, scope) {
  try {
    const json = JSON.stringify(state)
    localStorage.setItem(`${BRAIN_KEY}:${scope}`, json)
  } catch { /* quota */ }
}

export function useBrain(progress, authUser) {
  const curriculum = useMemo(() => webCurriculum(), [])
  const scope = authUser?.id || 'local'
  const scopeRef = useRef(scope)
  const stateRef = useRef(loadLocal(scope))
  const persistTimer = useRef(null)
  const cloudReadyScope = useRef(null)
  // A different account must never inherit the previous learner's graph.
  if (scopeRef.current !== scope) {
    clearTimeout(persistTimer.current)
    cloudReadyScope.current = null
    scopeRef.current = scope
    stateRef.current = loadLocal(scope)
  }
  const [tick, setTick] = useState(0)

  const engine = useMemo(() => {
    const e = new AdaptiveEngine({ curriculum, state: stateRef.current })
    hydrateFromProgress(e, progress)
    stateRef.current = e.state
    return e
  }, [progress, curriculum, tick, scope])

  const snapshot = useMemo(() => engine.snapshot(), [engine])

  const persist = useCallback((state) => {
    saveLocal(state, scope)
    if (!authUser?.id || cloudReadyScope.current !== scope || !canSyncProgress()) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      putBrain(state).catch(() => {})
    }, 600)
  }, [scope, authUser?.id])

  useEffect(() => {
    persist(engine.state)
  }, [engine.state.eventCount, engine.state.updatedAt, persist])

  useEffect(() => {
    if (!authUser?.id || !canSyncProgress()) return
    let cancelled = false
    fetchBrain()
      .then(data => {
        if (cancelled) return
        cloudReadyScope.current = scope
        if (!data?.state) return
        const merged = mergeStates(stateRef.current, data.state)
        stateRef.current = merged
        setTick(t => t + 1)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authUser?.id])

  useEffect(() => () => clearTimeout(persistTimer.current), [scope])

  const observe = useCallback((event) => {
    engine.observe(event)
    stateRef.current = engine.state
    persist(engine.state)
    setTick(t => t + 1)
    const snap = engine.snapshot()
    if (authUser?.id && canSyncProgress()) {
      observeBrain({ ...event, skillId: event.skillId, moduleId: event.moduleId }).catch(() => {})
    }
    return snap
  }, [engine, persist, authUser?.id])

  return { snapshot, observe, state: engine.state }
}
