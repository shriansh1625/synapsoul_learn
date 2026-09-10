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
  cmdLearningStats,
} from './engine.mjs'
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
  return idx !== -1 ? args[idx + 1] : undefined
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
  ${CLI_NAME} login [--email <email> --password <password>] [--json]
  ${CLI_NAME} status [--json] [--all]
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

Production:
  API  ${PRODUCTION_API}
  Site ${PRODUCTION_SITE}
  Protocol ${PRODUCTION_SITE}/skill.md
  Login required so cohort admin can see start / next / hint / decide / complete / sync.

Install (students — no git clone):
  Unix:    curl -fsSL ${PRODUCTION_SITE}/install | sh
  Windows: irm ${PRODUCTION_SITE}/install.ps1 | iex
`
}

async function main() {
  if (args.includes('--help') || args.includes('-h') || command === 'help') {
    console.log(helpText())
    return
  }
  if (args.includes('--version') || command === 'version' || args.includes('-v')) {
    console.log('synapsoul 2.1.0')
    return
  }

  await ensureCurriculum().catch(err => {
    if (command !== 'login' && command !== 'help') {
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
    case 'login':
      result = await cmdLogin({
        email: getFlag('--email'),
        password: getFlag('--password'),
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
    default:
      console.log(helpText())
      process.exit(0)
  }

  if (TUTOR_EVENT_COMMANDS[command]) {
    await emitTutorCliEvent(command, result, sessionBefore)
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
