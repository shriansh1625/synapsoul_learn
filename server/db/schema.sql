CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  degree TEXT,
  bio TEXT,
  college_name TEXT,
  username TEXT UNIQUE,
  track TEXT DEFAULT 'node',
  profile_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT 'CONTEXT',
  track TEXT DEFAULT 'node',
  hints_used INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

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

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id);
