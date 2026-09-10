import { loadProgress } from './engine.mjs'
import { isCliLoggedIn, postCliEvent, PRODUCTION_SITE } from './cloud.mjs'
import { CLI_NAME } from './paths.mjs'

export const TUTOR_EVENT_COMMANDS = {
  start: 'start',
  next: 'next',
  hint: 'hint',
  decide: 'decide',
  report: 'module_complete',
  sync: 'sync',
}

const SUCCESS_STATUS = new Set([
  'resuming',
  'first_run',
  'step_advanced',
  'decision_recorded',
  'hint',
  'module_completed',
  'pack_completed',
  'skill_completed',
  'synced',
  'sync_partial',
])

export function snapshotSession() {
  try {
    return loadProgress()?.session || null
  } catch {
    return null
  }
}

function isSuccess(command, result) {
  if (result == null) return false
  if (typeof result === 'string') {
    const text = result.trim()
    if (/^error:/i.test(text)) return false
    if (/^foundation required/i.test(text)) return false
    return true
  }
  return SUCCESS_STATUS.has(result.status)
}

function sessionFields(session, result) {
  const fromResult = result && typeof result === 'object' ? result.session : null
  return {
    skillId: session?.skillId || fromResult?.skillId || fromResult?.skill?.id || null,
    moduleId: session?.moduleId || fromResult?.moduleId || fromResult?.module?.id || null,
    step: session?.step || fromResult?.step || null,
    hintsUsed: session?.hintsUsed ?? fromResult?.hintsUsed ?? 0,
    track: session?.track || fromResult?.skill?.track || null,
  }
}

function payloadFor(type, result, session, sessionBefore) {
  const hintsUsed = session?.hintsUsed ?? sessionBefore?.hintsUsed ?? 0
  if (type === 'start') return { track: session?.track || null, source: 'cli' }
  if (type === 'next') {
    return {
      previousStep: result?.previousStep || null,
      hintsUsed,
      source: 'cli',
    }
  }
  if (type === 'hint') return { hintsUsed, source: 'cli' }
  if (type === 'decide') {
    const choice = result?.decision?.choice || result?.choice || null
    return { choice, hintsUsed, source: 'cli' }
  }
  if (type === 'module_complete') {
    return {
      score: result?.scores?.overall ?? null,
      hintsUsed: sessionBefore?.hintsUsed ?? hintsUsed,
      source: 'cli',
    }
  }
  if (type === 'sync') {
    const ok = result?.cloud?.ok === true || result?.status === 'synced'
    return { ok, source: 'cli' }
  }
  return { source: 'cli' }
}

export function annotateCliAuth(result) {
  const loggedIn = isCliLoggedIn()
  if (!result || typeof result !== 'object') return result
  result.cli_logged_in = loggedIn
  if (!loggedIn) {
    result.login_required = true
    result.login_message = `Sign in so cohort admin can see IDE activity. Run: ${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`
    const extra = Array.isArray(result.prompt_suggestions) ? result.prompt_suggestions : []
    result.prompt_suggestions = [
      `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
      `Open ${PRODUCTION_SITE}`,
      ...extra.filter(s => !/login/i.test(String(s))),
    ]
  }
  return result
}

export function loginReminderText() {
  return `\n\nSign in to attach this session to your cohort account:\n  ${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD`
}

export async function emitTutorCliEvent(command, result, sessionBefore) {
  const type = TUTOR_EVENT_COMMANDS[command]
  if (!type) return { ok: false, skipped: 'command' }
  if (!isSuccess(command, result)) return { ok: false, skipped: 'not_success' }

  let session = sessionBefore
  try {
    session = type === 'module_complete'
      ? sessionBefore
      : (loadProgress()?.session || sessionBefore)
  } catch {
    session = sessionBefore
  }

  const loc = sessionFields(session, result)
  const posted = await postCliEvent({
    type,
    skillId: loc.skillId,
    moduleId: loc.moduleId,
    step: type === 'module_complete' ? (sessionBefore?.step || 'REFLECT') : loc.step,
    payload: payloadFor(type, result, loc, sessionBefore),
  })

  if (result && typeof result === 'object') {
    result.cli_event = posted.ok ? 'posted' : (posted.loginRequired ? 'login_required' : 'skipped')
    if (posted.loginRequired) {
      result.login_required = true
      result.cli_logged_in = false
    }
  }
  return posted
}
