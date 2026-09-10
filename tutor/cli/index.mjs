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
  cmdLearningStats,
} from './engine.mjs'

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

async function main() {
  let result

  switch (command) {
    case 'status':
      result = args.includes('--all') ? cmdStatusAll({ json }) : cmdStatus(json)
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
        : { status: 'error', message: 'Usage: tutor learning stats [--json]' }
      break
    default:
      console.log(`LearnLab Tutor CLI

Commands:
  tutor status [--json] [--all]
  tutor sync [--publish] [--email <email> --password <password>] [--json]
  tutor catalog [--json]
  tutor start [--skill <id>] [--track <track>] [--json]
  tutor next --summary "..." --evidence "..."
  tutor decide <A|B> --reasoning "..."
  tutor hint | tutor ref <topic>
  tutor report '<json>'
  tutor profile | tutor profile update --name "..." --degree "..." --bio "..."
  tutor profile confirm
  tutor feedback --summary "..."
  tutor leaderboard [--json]
  tutor pretest [--json]
  tutor pretest submit --answers "1A,2A,3A,4A,5A"
  tutor score [--json]
  tutor share [--json]
  tutor learning stats [--json]

Cloud sync:
  Set LEARNLAB_API_URL=https://learnerslab.onrender.com
  Sign in at https://tutor-alpha-sandy.vercel.app/ then:
  node cli/index.mjs sync --email you@example.com --password your-password --json

Universal IDE prompt:
  Copy from https://tutor-alpha-sandy.vercel.app/ (clone repo if skill.md is missing)`)
      process.exit(0)
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
