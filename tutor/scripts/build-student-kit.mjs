#!/usr/bin/env node
/**
 * Packs the student-facing LearnLab kit into tutor/public/learnlab-kit.zip
 * so Vercel can serve it at /learnlab-kit.zip. Owner/server secrets stay out.
 */
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, posix, relative, sep } from 'path'
import { fileURLToPath } from 'url'
import { deflateRawSync, inflateRawSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TUTOR_DIR = join(__dirname, '..')
const ROOT_DIR = join(TUTOR_DIR, '..')
const PUBLIC_DIR = join(TUTOR_DIR, 'public')
const ZIP_PATH = join(PUBLIC_DIR, 'learnlab-kit.zip')
const KIT_PREFIX = 'learnlab-kit'

const FORBIDDEN_PATH = [
  /(^|\/)\.env(\.|$|\/)/i,
  /(^|\/)server\//i,
  /delete-user/i,
  /render\.ya?ml/i,
  /AdminDashboard/i,
  /adminOtp/i,
  /GITHUB_CLIENT_SECRET/i,
  /node_modules/,
  /(^|\/)\.git(\/|$)/,
  /live-test/i,
  /playwright/i,
  /(^|\/)e2e\//i,
]

const FORBIDDEN_TEXT = [
  /GITHUB_CLIENT_SECRET\s*=\s*\S+/,
  /RESEND_API_KEY\s*=\s*\S+/,
  /GMAIL_APP_PASSWORD\s*=\s*\S+/,
  /DATABASE_URL\s*=\s*postgres/i,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
]

const STUDENT_PACKAGE_JSON = {
  name: 'learnlab-tutor',
  private: true,
  version: '2.0.0',
  type: 'module',
  bin: { tutor: './cli/index.mjs' },
  scripts: {
    tutor: 'node cli/index.mjs',
    'tutor:status': 'node cli/index.mjs status --json',
    'tutor:catalog': 'node cli/index.mjs catalog --json',
    'tutor:start': 'node cli/index.mjs start --json',
  },
}

const STUDENT_GITIGNORE = [
  'node_modules/',
  'tutor/node_modules/',
  'tutor/data/sync/',
  'tutor/data/progress.json',
  'tutor/data/feedback/',
  '.env',
  '.env.local',
  '',
].join('\n')

const DATA_JSON_FILES = [
  'catalog.json',
  'curriculum.json',
  'glossary.json',
  'interludes.json',
  'progress.template.json',
  'leaderboard.json',
]

function toPosix(p) {
  return p.split(sep).join('/')
}

function crc32(buf) {
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return ~crc >>> 0
}

function dosDateTime(d = new Date()) {
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { dosTime, dosDate }
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}

function u32(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0, 0)
  return b
}

function writeZip(files) {
  const { dosTime, dosDate } = dosDateTime()
  const locals = []
  const centrals = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const uncompressed = file.data
    const compressed = deflateRawSync(uncompressed)
    const crc = crc32(uncompressed)
    const flags = 0x0800 // UTF-8 names
    const method = 8
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(compressed.length),
      u32(uncompressed.length),
      u16(name.length),
      u16(0),
      name,
      compressed,
    ])
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(flags),
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(compressed.length),
      u32(uncompressed.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const centralDir = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ])
  return Buffer.concat([...locals, centralDir, eocd])
}

function listZipNames(buf) {
  const sig = 0x06054b50
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === sig) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Invalid zip: missing EOCD')
  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  const names = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid zip: central directory')
    const method = buf.readUInt16LE(offset + 10)
    const compSize = buf.readUInt32LE(offset + 20)
    const uncompSize = buf.readUInt32LE(offset + 24)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localOff = buf.readUInt32LE(offset + 42)
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8')
    const dataStart = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28)
    const packed = buf.slice(dataStart, dataStart + compSize)
    const data = method === 8 ? inflateRawSync(packed) : packed
    if (data.length !== uncompSize) throw new Error(`Zip size mismatch for ${name}`)
    names.push({ name, data })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return names
}

function walkFiles(absDir, predicate) {
  const out = []
  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue
      const abs = join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(abs)
        continue
      }
      const rel = toPosix(relative(absDir, abs))
      if (predicate && !predicate(rel, ent.name)) continue
      out.push({ abs, rel })
    }
  }
  walk(absDir)
  return out
}

function kitName(rel) {
  return posix.join(KIT_PREFIX, rel)
}

function addFile(files, rel, data) {
  files.push({ name: kitName(rel), data: Buffer.isBuffer(data) ? data : Buffer.from(data) })
}

function addCopied(files, rel, abs) {
  addFile(files, rel, readFileSync(abs))
}

function assertSafe(files) {
  const errors = []
  for (const file of files) {
    const rel = file.name.replace(/^learnlab-kit\//, '')
    for (const re of FORBIDDEN_PATH) {
      if (re.test(file.name) || re.test(rel)) {
        errors.push(`forbidden path: ${file.name}`)
        break
      }
    }
    const text = file.data.toString('utf8')
    for (const re of FORBIDDEN_TEXT) {
      if (re.test(text)) errors.push(`forbidden content in ${file.name}: ${re}`)
    }
    if (/(^|\/)\.env(\.|$|\/)/i.test(rel) || rel === '.env') {
      errors.push(`forbidden .env: ${file.name}`)
    }
  }
  if (errors.length) {
    throw new Error(`Student kit leaked secrets or owner files:\n${errors.join('\n')}`)
  }
}

function collectFiles() {
  const files = []

  for (const name of ['skill.md', 'AGENTS.md', 'CLAUDE.md', 'PROMPT.md']) {
    addCopied(files, name, join(ROOT_DIR, name))
  }

  addCopied(files, 'README.md', join(TUTOR_DIR, 'README-student.md'))
  addCopied(files, 'tutor/README-student.md', join(TUTOR_DIR, 'README-student.md'))
  addFile(files, '.gitignore', STUDENT_GITIGNORE)
  addFile(files, 'tutor/package.json', `${JSON.stringify(STUDENT_PACKAGE_JSON, null, 2)}\n`)

  const cursorRule = join(ROOT_DIR, '.cursor', 'rules', 'ai-tutor.mdc')
  addCopied(files, '.cursor/rules/ai-tutor.mdc', cursorRule)

  for (const { abs, rel } of walkFiles(join(TUTOR_DIR, 'cli'))) {
    addCopied(files, `tutor/cli/${rel}`, abs)
  }

  for (const { abs, rel } of walkFiles(join(TUTOR_DIR, 'lib'), (rel, name) => {
    if (name.endsWith('.test.mjs') || name.endsWith('.test.js')) return false
    return true
  })) {
    addCopied(files, `tutor/lib/${rel}`, abs)
  }

  for (const { abs, rel } of walkFiles(join(TUTOR_DIR, 'data', 'skills'), (rel, name) => name.endsWith('.json'))) {
    addCopied(files, `tutor/data/skills/${rel}`, abs)
  }

  for (const name of DATA_JSON_FILES) {
    addCopied(files, `tutor/data/${name}`, join(TUTOR_DIR, 'data', name))
  }

  files.sort((a, b) => a.name.localeCompare(b.name))
  return files
}

function main() {
  mkdirSync(PUBLIC_DIR, { recursive: true })

  copyFileSync(join(ROOT_DIR, 'skill.md'), join(PUBLIC_DIR, 'skill.md'))
  copyFileSync(join(ROOT_DIR, 'PROMPT.md'), join(PUBLIC_DIR, 'PROMPT.md'))

  const files = collectFiles()
  assertSafe(files)

  const zip = writeZip(files)
  writeFileSync(ZIP_PATH, zip)

  const listed = listZipNames(zip)
  if (listed.length !== files.length) {
    throw new Error(`Zip entry count mismatch: wrote ${files.length}, read ${listed.length}`)
  }
  assertSafe(listed)

  const names = listed.map(f => f.name)
  const mustHave = [
    `${KIT_PREFIX}/skill.md`,
    `${KIT_PREFIX}/AGENTS.md`,
    `${KIT_PREFIX}/CLAUDE.md`,
    `${KIT_PREFIX}/PROMPT.md`,
    `${KIT_PREFIX}/README.md`,
    `${KIT_PREFIX}/tutor/package.json`,
    `${KIT_PREFIX}/tutor/cli/index.mjs`,
    `${KIT_PREFIX}/tutor/README-student.md`,
  ]
  for (const name of mustHave) {
    if (!names.includes(name)) throw new Error(`Student kit missing ${name}`)
  }
  for (const name of names) {
    if (/server\/|\.env|delete-user|render\.yaml|AdminDashboard/i.test(name)) {
      throw new Error(`Student kit contains owner path: ${name}`)
    }
  }

  const kb = Math.round(zip.length / 1024)
  console.log(`Student kit: ${files.length} files, ${kb} KB`)
  console.log(`Wrote ${toPosix(relative(ROOT_DIR, ZIP_PATH))}`)
  console.log('Copied skill.md and PROMPT.md to tutor/public/')
  console.log('VERIFY OK: no .env, no server/, no owner secrets')
}

main()
