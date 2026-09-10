#!/usr/bin/env node
/**
 * Packs the student CLI (cli + lib + curriculum JSON only) into
 * tutor/public/cli/learnlab-cli.tar.gz for the hosted installer.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from 'fs'
import { dirname, join, posix, relative, sep } from 'path'
import { fileURLToPath } from 'url'
import { gzipSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TUTOR_DIR = join(__dirname, '..')
const PUBLIC_CLI_DIR = join(TUTOR_DIR, 'public', 'cli')
const TARBALL_PATH = join(PUBLIC_CLI_DIR, 'learnlab-cli.tar.gz')

const FORBIDDEN_PATH = [
  /(^|\/)\.env(\.|$|\/)/i,
  /(^|\/)server\//i,
  /delete-user/i,
  /AdminDashboard/i,
  /adminOtp/i,
  /GITHUB_CLIENT_SECRET/i,
  /node_modules/,
  /(^|\/)\.git(\/|$)/,
]

const FORBIDDEN_TEXT = [
  /GITHUB_CLIENT_SECRET\s*=\s*\S+/,
  /RESEND_API_KEY\s*=\s*\S+/,
  /GMAIL_APP_PASSWORD\s*=\s*\S+/,
  /DATABASE_URL\s*=\s*postgres/i,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
]

const STUDENT_PACKAGE_JSON = {
  name: 'synapsoul',
  version: '2.1.2',
  private: true,
  type: 'module',
  bin: { synapsoul: './cli/index.mjs', learnlab: './cli/index.mjs' },
}

const DATA_JSON_FILES = [
  'catalog.json',
  'curriculum.json',
  'glossary.json',
  'interludes.json',
  'progress.template.json',
]

function toPosix(p) {
  return p.split(sep).join('/')
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

function addFile(files, rel, data) {
  files.push({ name: toPosix(rel), data: Buffer.isBuffer(data) ? data : Buffer.from(data) })
}

function assertSafe(files) {
  const errors = []
  for (const file of files) {
    for (const re of FORBIDDEN_PATH) {
      if (re.test(file.name)) errors.push(`forbidden path: ${file.name}`)
    }
    const text = file.data.toString('utf8')
    for (const re of FORBIDDEN_TEXT) {
      if (re.test(text)) errors.push(`forbidden content in ${file.name}`)
    }
  }
  if (errors.length) throw new Error(`CLI bundle leaked secrets:\n${errors.join('\n')}`)
}

function oct(n, width) {
  const s = n.toString(8)
  return s.padStart(width - 1, '0') + '\0'
}

function tarHeader(name, size, mode = 0o644) {
  const buf = Buffer.alloc(512)
  const nameBytes = Buffer.from(name, 'utf8')
  if (nameBytes.length > 100) {
    throw new Error(`Tar path too long: ${name}`)
  }
  nameBytes.copy(buf, 0)
  buf.write(oct(mode, 8), 100, 8, 'latin1')
  buf.write(oct(0, 8), 108, 8, 'latin1')
  buf.write(oct(0, 8), 116, 8, 'latin1')
  buf.write(oct(size, 12), 124, 12, 'latin1')
  buf.write(oct(Math.floor(Date.now() / 1000), 12), 136, 12, 'latin1')
  buf.write('        ', 148, 8, 'latin1')
  buf.write('0', 156, 1, 'latin1')
  buf.write('ustar\0', 257, 6, 'latin1')
  buf.write('00', 263, 2, 'latin1')
  let sum = 0
  for (let i = 0; i < 512; i++) sum += buf[i]
  const checksum = sum.toString(8).padStart(6, '0') + '\0 '
  buf.write(checksum, 148, 8, 'latin1')
  return buf
}

function writeTar(files) {
  const parts = []
  for (const file of files) {
    const data = file.data
    parts.push(tarHeader(file.name, data.length, file.name.endsWith('.mjs') || file.name.endsWith('synapsoul') || file.name.endsWith('learnlab') ? 0o755 : 0o644))
    parts.push(data)
    const pad = (512 - (data.length % 512)) % 512
    if (pad) parts.push(Buffer.alloc(pad))
  }
  parts.push(Buffer.alloc(1024))
  return Buffer.concat(parts)
}

function collectFiles() {
  const files = []
  addFile(files, 'package.json', `${JSON.stringify(STUDENT_PACKAGE_JSON, null, 2)}\n`)

  for (const { abs, rel } of walkFiles(join(TUTOR_DIR, 'cli'), (rel, name) => name.endsWith('.mjs'))) {
    addFile(files, `cli/${rel}`, readFileSync(abs))
  }

  for (const { abs, rel } of walkFiles(join(TUTOR_DIR, 'lib'), (rel, name) => {
    if (name.endsWith('.test.mjs') || name.endsWith('.test.js')) return false
    return true
  })) {
    addFile(files, `lib/${rel}`, readFileSync(abs))
  }

  for (const { abs, rel } of walkFiles(join(TUTOR_DIR, 'data', 'skills'), (rel, name) => name.endsWith('.json'))) {
    addFile(files, `data/skills/${rel}`, readFileSync(abs))
  }

  for (const name of DATA_JSON_FILES) {
    const abs = join(TUTOR_DIR, 'data', name)
    addFile(files, `data/${name}`, readFileSync(abs))
  }

  files.sort((a, b) => a.name.localeCompare(b.name))
  return files
}

function main() {
  mkdirSync(PUBLIC_CLI_DIR, { recursive: true })
  const files = collectFiles()
  assertSafe(files)
  const tar = writeTar(files)
  const gz = gzipSync(tar)
  writeFileSync(TARBALL_PATH, gz)

  const names = files.map(f => f.name)
  for (const must of ['cli/index.mjs', 'cli/engine.mjs', 'cli/paths.mjs', 'data/catalog.json', 'package.json']) {
    if (!names.includes(must)) throw new Error(`CLI bundle missing ${must}`)
  }
  const kb = Math.round(gz.length / 1024)
  console.log(`CLI bundle: ${files.length} files, ${kb} KB gzip`)
  console.log(`Wrote ${toPosix(relative(join(TUTOR_DIR, '..'), TARBALL_PATH))}`)
}

main()
