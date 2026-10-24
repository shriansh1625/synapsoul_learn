import pg from 'pg'
import dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { LOCKED_ADMIN_EMAIL } from '../lib/adminConstants.js'

dotenv.config()
const __dirname = dirname(fileURLToPath(import.meta.url))

export const pool = new pg.Pool({
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 30000,
  query_timeout: 10000,
  max: 5,
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
})

// Idle database disconnects must not terminate the web process.
pool.on('error', () => console.warn('Database pool connection interrupted'))

const LLM_SCHEMA = `
CREATE TABLE IF NOT EXISTS llm_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('coach', 'hint', 'reflect', 'decide')),
  skill_id TEXT,
  module_id TEXT,
  step TEXT,
  context_json JSONB DEFAULT '{}'::jsonb,
  prompt_hash TEXT,
  response_text TEXT,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id UUID REFERENCES llm_interactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reaction TEXT CHECK (reaction IN ('helpful', 'not_helpful', 'neutral')),
  implicit_score FLOAT,
  signal_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS llm_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('hint_style', 'coach_tone', 'reflect_probe', 'skill_specific')),
  skill_id TEXT,
  pattern_text TEXT NOT NULL,
  evidence_count INT DEFAULT 0,
  success_rate FLOAT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  metadata_json JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_llm_interactions_skill ON llm_interactions(skill_id, module_id, step);
CREATE INDEX IF NOT EXISTS idx_llm_interactions_user ON llm_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_reactions_interaction ON llm_reactions(interaction_id);
CREATE INDEX IF NOT EXISTS idx_llm_patterns_category ON llm_learned_patterns(category, skill_id);
`

export async function ensureLlmTables() {
  if (!process.env.DATABASE_URL) return false
  await pool.query(LLM_SCHEMA)
  return true
}

export async function checkDbHealth() {
  if (!process.env.DATABASE_URL) {
    return { db: 'not_configured', llmTables: 'n/a' }
  }
  try {
    await pool.query('SELECT 1')
    const { rows } = await pool.query(
      `SELECT
        to_regclass('public.llm_interactions') IS NOT NULL AS interactions,
        to_regclass('public.llm_reactions') IS NOT NULL AS reactions,
        to_regclass('public.llm_learned_patterns') IS NOT NULL AS patterns,
        to_regclass('public.cli_events') IS NOT NULL AS cli_events`
    )
    const row = rows[0] || {}
    const llmOk = row.interactions && row.reactions && row.patterns
    return {
      db: 'ok',
      llmTables: llmOk ? 'ok' : 'missing',
      cliEventsTable: row.cli_events ? 'ok' : 'missing',
    }
  } catch (e) {
    return { db: 'error', dbError: 'Database temporarily unavailable', llmTables: 'unknown' }
  }
}

const PROFILE_COLUMNS = [
  ['github_id', 'TEXT'],
  ['github_username', 'TEXT'],
  ['github_avatar', 'TEXT'],
  ['linkedin_url', 'TEXT'],
  ['headline', 'TEXT'],
  ['location', 'TEXT'],
  ['website', 'TEXT'],
  ['avatar_url', 'TEXT'],
  ['profile_public', 'BOOLEAN DEFAULT false'],
  ['is_admin', 'BOOLEAN DEFAULT false'],
  ['last_seen', 'TIMESTAMPTZ'],
]

export async function ensureProfileColumns() {
  if (!process.env.DATABASE_URL) return false
  for (const [name, type] of PROFILE_COLUMNS) {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${name} ${type}`)
  }
  try {
    await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL')
  } catch (e) {
    console.warn('password_hash nullability:', e.message)
  }
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users (github_id) WHERE github_id IS NOT NULL'
  )
  const adminEmail = LOCKED_ADMIN_EMAIL
  await pool.query(
    'UPDATE users SET is_admin = (lower(email) = lower($1))',
    [adminEmail]
  )
  return true
}

export async function ensureAdminOtpTables() {
  if (!process.env.DATABASE_URL) return false
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_otps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    )
  `)
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_otps_code_hash ON admin_otps (code_hash)')
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_otps_unused_hash ON admin_otps (code_hash) WHERE used_at IS NULL')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_admin_otps_email_created ON admin_otps (email, created_at DESC)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      verified_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions (user_id, expires_at)')
  return true
}

export async function ensureCliAuthPendingTable() {
  if (!process.env.DATABASE_URL) return false
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cli_auth_pending (
      nonce TEXT PRIMARY KEY,
      token TEXT,
      email TEXT,
      name TEXT,
      username TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_cli_auth_pending_expires ON cli_auth_pending (expires_at)'
  )
  return true
}

export async function ensureLearnerDigestColumn() {
  if (!process.env.DATABASE_URL) return false
  await pool.query(
    'ALTER TABLE student_memory ADD COLUMN IF NOT EXISTS learner_digest JSONB DEFAULT NULL'
  )
  return true
}

export async function ensureCliEventsTable() {
  if (!process.env.DATABASE_URL) return false
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cli_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      skill_id TEXT,
      module_id TEXT,
      step TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_cli_events_user_created ON cli_events (user_id, created_at DESC)'
  )
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_cli_events_created ON cli_events (created_at DESC)'
  )
  await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT')
  return true
}

export async function initDb() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  try {
    await pool.query(schema)
  } catch (e) {
    console.warn('Full schema apply warning:', e.message)
  }
  try {
    await ensureProfileColumns()
  } catch (e) {
    console.warn('Profile column migration warning:', e.message)
  }
  try {
    await ensureLlmTables()
  } catch (e) {
    console.warn('LLM table migration warning:', e.message)
    throw e
  }
  try {
    await ensureAdminOtpTables()
  } catch (e) {
    console.warn('Admin OTP table migration warning:', e.message)
  }
  try {
    await ensureCliEventsTable()
  } catch (e) {
    console.warn('CLI events table migration warning:', e.message)
  }
  try {
    await ensureLearnerDigestColumn()
  } catch (e) {
    console.warn('Learner digest column migration warning:', e.message)
  }
  try {
    await ensureCliAuthPendingTable()
  } catch (e) {
    console.warn('CLI auth pending table migration warning:', e.message)
  }
}
