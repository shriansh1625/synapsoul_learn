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
