#!/usr/bin/env node
import {
  cmdStatus,
  cmdCatalog,
  cmdStart,
  cmdNext,
  cmdDecide,
  cmdHint,
  cmdRef,
  cmdReport,
  cmdProfile,
  cmdProfileUpdate,
  cmdProfileConfirm,
  cmdFeedback,
  cmdLeaderboard,
  cmdPretest,
  cmdPretestSubmit,
  cmdScore,
  cmdShare,
  cmdStatusAll,
  cmdSync,
  cmdLogin,
  cmdRegister,
  cmdLearningStats,
  cmdGraph,
} from './engine.mjs'
import {
  cmdLearnStatus,
  cmdLearnConsolidate,
  observeAfterCli,
  observeAfterSync,
  observeSessionStart,
  shouldCliLearnerObserve,
} from './learner.mjs'
import { ensureCurriculum } from './curriculumApi.mjs'
import { PRODUCTION_API, PRODUCTION_SITE, CLI_NAME } from './paths.mjs'
import { isCliLoggedIn } from './cloud.mjs'
import {
  TUTOR_EVENT_COMMANDS,
  snapshotSession,
  annotateCliAuth,
  loginReminderText,
  emitTutorCliEvent,
} from './telemetry.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')
const command = args[0] || 'status'

function getFlag(name) {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  const value = args[idx + 1]
  if (!value || String(value).startsWith('--')) return undefined
  return value
}

function getMultiFlag(name) {
  const values = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1])
  }
  return values
}

function helpText() {
  return `SynapSoul Learn Hub CLI

Commands:
  ${CLI_NAME} register --email <email> --password <password> --name "<name>" [--json]
  ${CLI_NAME} login [--email <email> --password <password>] [--json]
  ${CLI_NAME} login --github [--json]
  ${CLI_NAME} login --token <jwt> [--json]
  ${CLI_NAME} status [--json] [--all]
  ${CLI_NAME} graph [--json]
  ${CLI_NAME} sync [--publish] [--email <email> --password <password>] [--json]
  ${CLI_NAME} catalog [--json]
  ${CLI_NAME} start [--skill <id>] [--track <track>] [--json]
  ${CLI_NAME} next --summary "..." --evidence "..."
  ${CLI_NAME} decide <A|B> --reasoning "..."
  ${CLI_NAME} hint | ${CLI_NAME} ref <topic>
  ${CLI_NAME} report '<json>'
  ${CLI_NAME} profile | ${CLI_NAME} profile update --name "..." --degree "..." --bio "..."
  ${CLI_NAME} profile confirm
  ${CLI_NAME} feedback --summary "..."
  ${CLI_NAME} leaderboard [--json]
  ${CLI_NAME} pretest [--json]
  ${CLI_NAME} pretest submit --answers "1A,2A,3A,4A,5A"
  ${CLI_NAME} score [--json]
  ${CLI_NAME} share [--json]
  ${CLI_NAME} learning stats [--json]
  ${CLI_NAME} learn status [--json]
  ${CLI_NAME} learn consolidate

Production:
  API  ${PRODUCTION_API}
  Site ${PRODUCTION_SITE}
  Protocol ${PRODUCTION_SITE}/skill.md
  Login or register first so the CLI has a JWT. Teaching commands stay blocked until then.

Install (students — no git clone):
  Unix:    curl -fsSL ${PRODUCTION_SITE}/install | sh
  Windows: irm ${PRODUCTION_SITE}/install.ps1 | iex
`
}

const REQUIRES_JWT = new Set(['start', 'next', 'decide', 'hint', 'report', 'pretest', 'score'])

function loginRequiredPayload() {
  return {
    status: 'login_required',
    login_required: true,
    cli_logged_in: false,
    message: `Register or log in before teaching. IDE: ${CLI_NAME} register --email YOUR_EMAIL --password YOUR_PASSWORD --name "Your Name" --json  or  ${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json  or  ${CLI_NAME} login --github --json. Or register at ${PRODUCTION_SITE} then ${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
    site: PRODUCTION_SITE,
    api: PRODUCTION_API,
    prompt_suggestions: [
      `${CLI_NAME} register --email YOUR_EMAIL --password YOUR_PASSWORD --name "Your Name" --json`,
      `${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
      `${CLI_NAME} login --github --json`,
      `Or register at ${PRODUCTION_SITE} then ${CLI_NAME} login --email YOUR_EMAIL --password YOUR_PASSWORD --json`,
    ],
  }
}

async function main() {
  if (args.includes('--help') || args.includes('-h') || command === 'help') {
    console.log(helpText())
    return
  }
  if (args.includes('--version') || command === 'version' || args.includes('-v')) {
    console.log('synapsoul 2.1.2')
    return
  }

  if (REQUIRES_JWT.has(command) && !isCliLoggedIn()) {
    let result = loginRequiredPayload()
    result = annotateCliAuth(result)
    if (json || typeof result === 'object') console.log(JSON.stringify(result, null, 2))
    else console.log(result.message)
    process.exit(1)
  }

  await ensureCurriculum().catch(err => {
    if (command !== 'login' && command !== 'register' && command !== 'help') {
      console.error(JSON.stringify({ status: 'error', message: `Curriculum unavailable: ${err.message}` }))
      process.exit(1)
    }
  })

  const sessionBefore = TUTOR_EVENT_COMMANDS[command] ? snapshotSession() : null
  let result

  switch (command) {
    case 'status':
      result = args.includes('--all') ? cmdStatusAll({ json }) : cmdStatus(json)
      break
    case 'graph':
      result = await cmdGraph({ json })
      break
    case 'login':
      result = await cmdLogin({
        email: getFlag('--email'),
        password: getFlag('--password'),
        token: getFlag('--token'),
        github: args.includes('--github'),
        json,
      })
      break
    case 'register':
      result = await cmdRegister({
        email: getFlag('--email'),
        password: getFlag('--password'),
        name: getFlag('--name'),
        json,
      })
      break
    case 'sync':
      result = await cmdSync({
        publish: args.includes('--publish'),
        json,
        email: getFlag('--email'),
        password: getFlag('--password'),
      })
      break
    case 'catalog':
      result = cmdCatalog(json)
      break
    case 'start':
      result = cmdStart({ skill: getFlag('--skill'), track: getFlag('--track'), json })
      break
    case 'next':
      result = cmdNext({
        summary: getFlag('--summary'),
        evidence: getMultiFlag('--evidence')[0],
        proofFile: getFlag('--proof-file'),
        json,
      })
      break
    case 'decide':
      result = cmdDecide({
        choice: args.find(a => a === 'A' || a === 'B'),
        reasoning: getFlag('--reasoning'),
        json,
      })
      break
    case 'hint':
      result = await cmdHint({ json })
      break
    case 'ref':
      result = cmdRef({ topic: args[args.indexOf('ref') + 1], json })
      break
    case 'report':
      result = cmdReport({ reportJson: args[args.indexOf('report') + 1], json })
      break
    case 'profile':
      if (args[1] === 'update') {
        result = cmdProfileUpdate({
          name: getFlag('--name'),
          degree: getFlag('--degree'),
          bio: getFlag('--bio'),
          username: getFlag('--username'),
          college: getFlag('--college'),
          track: getFlag('--track'),
          json,
        })
      } else if (args[1] === 'confirm') {
        result = cmdProfileConfirm({ json })
      } else {
        result = cmdProfile({ json })
      }
      break
    case 'feedback':
      result = cmdFeedback({ summary: getFlag('--summary'), type: getFlag('--type'), json })
      break
    case 'leaderboard':
      result = cmdLeaderboard({ json })
      break
    case 'pretest':
      result = args[1] === 'submit'
        ? cmdPretestSubmit({ answers: getFlag('--answers'), json })
        : cmdPretest({ json })
      break
    case 'score':
      result = cmdScore({ json })
      break
    case 'share':
      result = cmdShare({ json })
      break
    case 'learning':
      result = args[1] === 'stats'
        ? await cmdLearningStats({ json })
        : { status: 'error', message: `Usage: ${CLI_NAME} learning stats [--json]` }
      break
    case 'learn':
      if (args[1] === 'status') result = await cmdLearnStatus({ json })
      else if (args[1] === 'consolidate') result = await cmdLearnConsolidate({ json })
      else result = { status: 'error', message: `Usage: ${CLI_NAME} learn status|consolidate [--json]` }
      break
    default:
      console.log(helpText())
      process.exit(0)
  }

  if (TUTOR_EVENT_COMMANDS[command]) {
    await emitTutorCliEvent(command, result, sessionBefore)
  }

  if (isCliLoggedIn()) {
    if ((command === 'login' || command === 'register') && result?.status === 'logged_in') {
      observeSessionStart('cli')
    } else if (shouldCliLearnerObserve(command, result)) {
      observeAfterCli(command, result, sessionBefore)
    }
    if (command === 'sync' && shouldCliLearnerObserve('sync', result)) {
      await observeAfterSync()
    }
  }
  result = annotateCliAuth(result)

  if (!json && typeof result === 'string' && !isCliLoggedIn() && TUTOR_EVENT_COMMANDS[command]) {
    result += loginReminderText()
  }

  if (typeof result === 'object') {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(result)
  }
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }))
  process.exit(1)
})
