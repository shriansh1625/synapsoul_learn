/**
 * Autonomous API journey against LearnLab production (or LEARNLAB_API_URL).
 * Writes test-results/live-audit-api.json and merges into live-audit-latest.json.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const RESULTS_DIR = join(REPO_ROOT, 'test-results')

const API_BASE = (process.env.LEARNLAB_API_URL || 'https://learnerslab.onrender.com').replace(/\/$/, '')

function nowIso() {
  return new Date().toISOString()
}

async function fetchJson(path, { method = 'GET', token, body, timeoutMs = 60_000 } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let data
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text.slice(0, 500) }
    }
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

async function runStep(steps, name, fn) {
  const started = performance.now()
  try {
    const detail = await fn()
    const ms = Math.round(performance.now() - started)
    steps.push({ name, status: 'pass', ms, ...detail })
    return detail
  } catch (e) {
    const ms = Math.round(performance.now() - started)
    steps.push({ name, status: 'fail', ms, error: e.message })
    throw e
  }
}

function mergeLatestReport(partial) {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const latestPath = join(RESULTS_DIR, 'live-audit-latest.json')
  let existing = {}
  if (existsSync(latestPath)) {
    try {
      existing = JSON.parse(readFileSync(latestPath, 'utf8'))
    } catch {
      existing = {}
    }
  }
  const merged = {
    ...existing,
    ...partial,
    updatedAt: nowIso(),
  }
  writeFileSync(latestPath, JSON.stringify(merged, null, 2))
}

export async function runApiJourney() {
  const startedAt = nowIso()
  const t0 = performance.now()
  const steps = []
  const email = `audit-live-${Date.now()}@test.local`
  const password = `AuditLive_${Date.now()}_x9`
  let token = null
  let interactionId = null
  let statsBefore = null
  let statsAfter = null

  const ctx = { email, apiBase: API_BASE }

  await runStep(steps, 'health', async () => {
    const { ok, status, data } = await fetchJson('/api/health')
    if (!ok || data?.status !== 'ok') throw new Error(`health failed ${status}: ${JSON.stringify(data)}`)
    return { evidence: { status: data.status, db: data.database ?? data.db } }
  })

  await runStep(steps, 'llm_status', async () => {
    const { ok, status, data } = await fetchJson('/api/llm/status')
    if (!ok) throw new Error(`llm status ${status}`)
    if (typeof data?.enabled !== 'boolean') throw new Error('missing enabled flag')
    return { evidence: { enabled: data.enabled, instructor: data.instructor } }
  })

  await runStep(steps, 'learning_stats_initial', async () => {
    const { ok, status, data } = await fetchJson('/api/learning/stats')
    if (!ok) throw new Error(`learning stats ${status}`)
    statsBefore = data
    return { evidence: { interactions: data.interactions, reactions: data.reactions } }
  })

  await runStep(steps, 'register', async () => {
    const { ok, status, data } = await fetchJson('/api/auth/register', {
      method: 'POST',
      body: {
        email,
        password,
        name: 'Live Audit Bot',
        degree: 'B.Tech',
        bio: 'Autonomous live test user',
        username: `audit${Date.now()}`,
        track: 'node',
      },
    })
    if (!ok || !data?.token) throw new Error(`register ${status}: ${JSON.stringify(data)}`)
    token = data.token
    return { evidence: { userId: data.user?.id, email } }
  })

  await runStep(steps, 'login', async () => {
    const { ok, status, data } = await fetchJson('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    if (!ok || !data?.token) throw new Error(`login ${status}: ${JSON.stringify(data)}`)
    token = data.token
    return { evidence: { email: data.user?.email } }
  })

  await runStep(steps, 'auth_me', async () => {
    const { ok, status, data } = await fetchJson('/api/auth/me', { token })
    if (!ok || !data?.email) throw new Error(`me ${status}: ${JSON.stringify(data)}`)
    return { evidence: { email: data.email } }
  })

  await runStep(steps, 'progress_get', async () => {
    const { ok, status, data } = await fetchJson('/api/progress', { token })
    if (!ok) throw new Error(`progress ${status}: ${JSON.stringify(data)}`)
    return { evidence: { hasSession: Boolean(data?.session) } }
  })

  await runStep(steps, 'brain_get', async () => {
    const { ok, status, data } = await fetchJson('/api/brain', { token })
    if (!ok || !data?.snapshot) throw new Error(`brain ${status}: ${JSON.stringify(data)}`)
    return { evidence: { hasSnapshot: true } }
  })

  await runStep(steps, 'llm_coach', async () => {
    const { ok, status, data } = await fetchJson('/api/llm/coach', {
      method: 'POST',
      token,
      body: {
        skillId: 'system-design-fundamentals',
        moduleId: 'api-design',
        step: 'CONTEXT',
        track: 'node',
      },
      timeoutMs: 90_000,
    })
    if (!ok) throw new Error(`coach ${status}: ${JSON.stringify(data)}`)
    const source = data?.source
    if (!['llm', 'heuristic'].includes(source) && !String(source).includes('heuristic')) {
      throw new Error(`unexpected coach source: ${source}`)
    }
    if (!data?.interactionId) throw new Error('missing interactionId')
    interactionId = data.interactionId
    return { evidence: { source, interactionId, hasNote: Boolean(data.note || data.hint) } }
  })

  await runStep(steps, 'learning_react_helpful', async () => {
    const { ok, status, data } = await fetchJson('/api/learning/react', {
      method: 'POST',
      token,
      body: { interactionId, reaction: 'helpful' },
    })
    if (!ok || !data?.ok) throw new Error(`react ${status}: ${JSON.stringify(data)}`)
    return { evidence: { reactionCount: data.reactionCount } }
  })

  await runStep(steps, 'llm_hint', async () => {
    const { ok, status, data } = await fetchJson('/api/llm/hint', {
      method: 'POST',
      token,
      body: {
        skillId: 'system-design-fundamentals',
        moduleId: 'api-design',
        step: 'BUILD',
        track: 'node',
        hintText: 'Define your API routes first.',
        hintsUsed: 1,
      },
      timeoutMs: 90_000,
    })
    if (!ok) throw new Error(`hint ${status}: ${JSON.stringify(data)}`)
    return { evidence: { source: data?.source, interactionId: data?.interactionId } }
  })

  await runStep(steps, 'learning_stats_after', async () => {
    const { ok, status, data } = await fetchJson('/api/learning/stats', { token })
    if (!ok) throw new Error(`learning stats after ${status}`)
    statsAfter = data
    const interactionsUp = (data.interactions ?? 0) >= (statsBefore?.interactions ?? 0) + 1
    const reactionsUp = (data.reactions ?? 0) >= (statsBefore?.reactions ?? 0) + 1
    if (!interactionsUp) {
      throw new Error(
        `interactions did not increase (before ${statsBefore?.interactions}, after ${data.interactions})`
      )
    }
    if (!reactionsUp) {
      throw new Error(
        `reactions did not increase (before ${statsBefore?.reactions}, after ${data.reactions})`
      )
    }
    return {
      evidence: {
        interactionsBefore: statsBefore?.interactions,
        interactionsAfter: data.interactions,
        reactionsBefore: statsBefore?.reactions,
        reactionsAfter: data.reactions,
      },
    }
  })

  const durationMs = Math.round(performance.now() - t0)
  const failed = steps.filter(s => s.status === 'fail').length
  const passed = steps.filter(s => s.status === 'pass').length

  const report = {
    suite: 'live-api',
    target: API_BASE,
    startedAt,
    finishedAt: nowIso(),
    durationMs,
    summary: { passed, failed, total: steps.length },
    context: ctx,
    steps,
    cleanupNote: 'No delete-user endpoint; audit users remain in DB with @test.local emails.',
  }

  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(join(RESULTS_DIR, 'live-audit-api.json'), JSON.stringify(report, null, 2))
  mergeLatestReport({ api: report, frontend: process.env.LEARNLAB_FRONTEND_URL || null })

  return report
}

function printHumanSummary(report) {
  const { summary, durationMs, target } = report
  console.log('\n=== LearnLab Live API Audit ===')
  console.log(`Target: ${target}`)
  console.log(`Duration: ${durationMs}ms`)
  console.log(`Result: ${summary.passed}/${summary.total} passed, ${summary.failed} failed\n`)
  for (const s of report.steps) {
    const mark = s.status === 'pass' ? '✓' : '✗'
    console.log(`  ${mark} ${s.name} (${s.ms}ms)${s.error ? ` — ${s.error}` : ''}`)
  }
  console.log('')
}

import { pathToFileURL } from 'url'

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  runApiJourney()
    .then(report => {
      printHumanSummary(report)
      process.exit(report.summary.failed > 0 ? 1 : 0)
    })
    .catch(e => {
      console.error('Live API audit crashed:', e.message)
      process.exit(1)
    })
}
