import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import catalog from '../../data/catalog.json'
import { AdaptiveEngine, hydrateFromProgress, mergeStates, buildCurriculum } from '../../lib/brain/index.js'
import { SKILL_MANIFESTS } from '../../lib/brain/curriculumData.js'
import { canSyncProgress, fetchBrain, putBrain, observeBrain } from '../api.js'

const BRAIN_KEY = 'synapsoul-brain-v1'
const LEGACY_BRAIN_KEY = 'learnlab-brain-v1'

function webCurriculum() {
  return buildCurriculum(catalog, SKILL_MANIFESTS)
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(BRAIN_KEY) || localStorage.getItem(LEGACY_BRAIN_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveLocal(state) {
  try {
    const json = JSON.stringify(state)
    localStorage.setItem(BRAIN_KEY, json)
    localStorage.setItem(LEGACY_BRAIN_KEY, json)
  } catch { /* quota */ }
}

export function useBrain(progress, authUser) {
  const curriculum = useMemo(() => webCurriculum(), [])
  const stateRef = useRef(loadLocal())
  const persistTimer = useRef(null)
  const [tick, setTick] = useState(0)

  const engine = useMemo(() => {
    const e = new AdaptiveEngine({ curriculum, state: stateRef.current })
    hydrateFromProgress(e, progress)
    stateRef.current = e.state
    return e
  }, [progress, curriculum, tick])

  const snapshot = useMemo(() => engine.snapshot(), [engine])

  const persist = useCallback((state) => {
    saveLocal(state)
    if (!canSyncProgress()) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      putBrain(state).catch(() => {})
    }, 600)
  }, [])

  useEffect(() => {
    persist(engine.state)
  }, [engine.state.eventCount, engine.state.updatedAt, persist])

  useEffect(() => {
    if (!canSyncProgress()) return
    let cancelled = false
    fetchBrain()
      .then(data => {
        if (cancelled || !data?.state) return
        const merged = mergeStates(stateRef.current, data.state)
        stateRef.current = merged
        setTick(t => t + 1)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [authUser])

  const observe = useCallback((event) => {
    engine.observe(event)
    stateRef.current = engine.state
    persist(engine.state)
    setTick(t => t + 1)
    const snap = engine.snapshot()
    if (canSyncProgress()) {
      observeBrain({ ...event, skillId: event.skillId, moduleId: event.moduleId }).catch(() => {})
    }
    return snap
  }, [engine, persist])

  return { snapshot, observe, state: engine.state }
}
