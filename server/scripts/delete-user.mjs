/**
 * One-off owner tool: delete a LearnLab user so that email can register again.
 *
 *   cd server
 *   # bash
 *   EMAIL=omshriansh16@gmail.com node scripts/delete-user.mjs
 *   # PowerShell
 *   $env:EMAIL="omshriansh16@gmail.com"; node scripts/delete-user.mjs
 *
 * Optional: USERNAME=shiv  (default shiv) — only deleted if it is the same user as EMAIL.
 * Requires DATABASE_URL in server/.env (Render Postgres). Never commit that file.
 * Not an HTTP endpoint.
 */
import pg from 'pg'
import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const EMAIL = String(process.env.EMAIL || '').trim()
const USERNAME = String(process.env.USERNAME || 'shiv').trim()
const DATABASE_URL = process.env.DATABASE_URL || ''

function looksLikePlaceholder(url) {
  if (!url) return true
  return /user:pass@host|:\/\/user:pass@|@host:5432\//i.test(url)
}

function redactedDbHost(url) {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

if (!EMAIL || !EMAIL.includes('@')) {
  console.error('Set EMAIL to the account to delete, e.g. EMAIL=omshriansh16@gmail.com')
  process.exit(1)
}

if (!DATABASE_URL || looksLikePlaceholder(DATABASE_URL)) {
  console.error(
    'DATABASE_URL is missing or still the placeholder in server/.env.\n' +
      'Paste the Render Postgres External Connection String (Dashboard → learnlab-db → Connections), then rerun.\n' +
      'Do not commit .env.'
  )
  process.exit(1)
}

const CHILD_TABLES = [
  'admin_sessions',
  'user_sessions',
  'completed_modules',
  'decisions',
  'scores',
  'portfolio',
  'student_memory',
  'llm_interactions',
  'llm_reactions',
]

async function tableExists(client, name) {
  const { rows } = await client.query('SELECT to_regclass($1) AS reg', [`public.${name}`])
  return Boolean(rows[0]?.reg)
}

async function countWhere(client, table, clause, params) {
  if (!(await tableExists(client, table))) return { exists: false, count: 0 }
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${clause}`,
    params
  )
  return { exists: true, count: rows[0].count }
}

async function snapshot(client, userId) {
  const counts = {}
  for (const table of CHILD_TABLES) {
    counts[table] = await countWhere(client, table, 'user_id = $1', [userId])
  }
  counts.admin_otps = await countWhere(client, 'admin_otps', 'lower(email) = lower($1)', [EMAIL])
  counts.users_email = await countWhere(client, 'users', 'lower(email) = lower($1)', [EMAIL])
  counts.users_username = await countWhere(client, 'users', 'lower(username) = lower($1)', [USERNAME])
  return counts
}

function printCounts(label, counts) {
  console.log(label)
  for (const [k, v] of Object.entries(counts)) {
    if (!v.exists) {
      console.log(`  ${k}: (table missing)`)
    } else {
      console.log(`  ${k}: ${v.count}`)
    }
  }
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})

const client = await pool.connect()
try {
  console.log(`Target email: ${EMAIL}`)
  console.log(`Username only if same user: ${USERNAME}`)
  console.log(`DB: ${redactedDbHost(DATABASE_URL)}`)

  const { rows: byEmail } = await client.query(
    `SELECT id, email, name, username, is_admin, github_id, github_username
     FROM users WHERE lower(email) = lower($1)`,
    [EMAIL]
  )
  const { rows: byUsername } = await client.query(
    `SELECT id, email, name, username, is_admin
     FROM users WHERE lower(username) = lower($1)`,
    [USERNAME]
  )

  const target = byEmail[0] || null
  const usernameRow = byUsername[0] || null

  if (usernameRow && target && usernameRow.id !== target.id) {
    console.log(
      `Username "${USERNAME}" belongs to a different user (${usernameRow.email}). Leaving that account alone.`
    )
  } else if (usernameRow && !target) {
    console.log(
      `No user with email ${EMAIL}. Username "${USERNAME}" belongs to ${usernameRow.email} — not deleting other people.`
    )
    process.exit(2)
  }

  if (!target) {
    console.log(`No user found for ${EMAIL}. Email UNIQUE slot is already free.`)
    const leftoverUsername =
      usernameRow && (!target || usernameRow.id === target?.id) ? usernameRow : null
    if (!leftoverUsername) {
      console.log(`No leftover users row for username ${USERNAME} either.`)
    }
    process.exit(0)
  }

  console.log(
    `Found user ${target.id} name=${JSON.stringify(target.name)} username=${target.username || '(none)'} admin=${target.is_admin}`
  )

  const before = await snapshot(client, target.id)
  printCounts('Before:', before)

  await client.query('BEGIN')
  try {
    if (await tableExists(client, 'llm_reactions')) {
      await client.query('DELETE FROM llm_reactions WHERE user_id = $1', [target.id])
    }
    if (await tableExists(client, 'llm_interactions')) {
      await client.query('DELETE FROM llm_interactions WHERE user_id = $1', [target.id])
    }
    if (await tableExists(client, 'admin_otps')) {
      await client.query('DELETE FROM admin_otps WHERE lower(email) = lower($1)', [EMAIL])
    }
    const deleted = await client.query(
      'DELETE FROM users WHERE id = $1 AND lower(email) = lower($2) RETURNING id, email, username',
      [target.id, EMAIL]
    )
    if (deleted.rowCount !== 1) {
      throw new Error(`Expected to delete 1 users row, deleted ${deleted.rowCount}`)
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }

  const after = await snapshot(client, target.id)
  printCounts('After:', after)

  const emailTaken = after.users_email.count
  const usernameTakenSame =
    after.users_username.count > 0 &&
    usernameRow &&
    usernameRow.id === target.id

  if (emailTaken !== 0) {
    console.error('Email UNIQUE is still taken. Register will 409.')
    process.exit(3)
  }

  console.log(`Deleted user ${target.id}. UNIQUE(email) is free for ${EMAIL}.`)
  if (usernameRow && usernameRow.id === target.id) {
    console.log(`Username ${USERNAME} is free (it belonged to this user).`)
  }
  if (after.users_username.count > 0 && usernameRow && usernameRow.id !== target.id) {
    console.log(`Username ${USERNAME} still exists for another person — left untouched.`)
  }
  const leftoverChildren = Object.entries(after)
    .filter(([k, v]) => v.exists && v.count > 0 && !k.startsWith('users_'))
    .map(([k, v]) => `${k}=${v.count}`)
  if (leftoverChildren.length) {
    console.log(`Leftover rows: ${leftoverChildren.join(', ')}`)
  } else {
    console.log('No leftover child rows for this user.')
  }
} catch (e) {
  console.error('Delete failed:', e.message)
  process.exit(1)
} finally {
  client.release()
  await pool.end()
}
