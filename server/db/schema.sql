CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  degree TEXT,
  bio TEXT,
  college_name TEXT,
  username TEXT UNIQUE,
  track TEXT DEFAULT 'node',
  profile_confirmed BOOLEAN DEFAULT false,
  github_id TEXT,
  github_username TEXT,
  github_avatar TEXT,
  linkedin_url TEXT,
  headline TEXT,
  location TEXT,
  website TEXT,
  avatar_url TEXT,
  profile_public BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users (github_id) WHERE github_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'CONTEXT',
  track TEXT DEFAULT 'node',
  hints_used INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT,
  PRIMARY KEY (user_id)
);

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT;

CREATE TABLE IF NOT EXISTS completed_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  score NUMERIC,
  track TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id, module_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  choice TEXT NOT NULL,
  reasoning TEXT,
  PRIMARY KEY (user_id, skill_id, module_id)
);

CREATE TABLE IF NOT EXISTS scores (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  overall NUMERIC,
  dimensions JSONB,
  narrative TEXT,
  PRIMARY KEY (user_id, skill_id, module_id)
);

CREATE TABLE IF NOT EXISTS portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  artifact TEXT,
  student_action TEXT,
  technical_detail TEXT,
  proof TEXT,
  ability TEXT,
  confidence TEXT,
  skill_id TEXT,
  module_id TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_memory (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE student_memory ADD COLUMN IF NOT EXISTS learner_digest JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);

-- Self-learning instructor: interaction log, reactions, distilled patterns
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

CREATE TABLE IF NOT EXISTS admin_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_otps_code_hash ON admin_otps (code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_otps_unused_hash ON admin_otps (code_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_otps_email_created ON admin_otps (email, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions (user_id, expires_at);

-- Honest LMS telemetry from the student CLI (start/next/hint/decide/complete/sync).
-- Not keylogging: no IDE files, clipboard, screenshots, or unrelated process data.
CREATE TABLE IF NOT EXISTS cli_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  skill_id TEXT,
  module_id TEXT,
  step TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cli_events_user_created ON cli_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cli_events_created ON cli_events (created_at DESC);

-- Short-lived nonce → JWT for `synapsoul login --github` CLI polling. Not a user session table.
CREATE TABLE IF NOT EXISTS cli_auth_pending (
  nonce TEXT PRIMARY KEY,
  token TEXT,
  email TEXT,
  name TEXT,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cli_auth_pending_expires ON cli_auth_pending (expires_at);
