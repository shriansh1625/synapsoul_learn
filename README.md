# LearnLab — The Open Engineering Bootcamp in Your IDE

**Your AI editor becomes your private engineering instructor.**

Paste one prompt. Get a tutor that remembers how you learn, adapts to your level, and builds proof of how you think.

**GitHub:** https://github.com/shriansh1625/learnerslab

## Universal Prompt (any IDE)

```
Read skill.md and follow the instructions
```

Works with **Cursor**, **Claude Code**, **Codex**, **Antigravity**, and any AI editor that can read files and run terminal commands.

See [PROMPT.md](PROMPT.md) for IDE-specific variants.

---

## Why LearnLab

- **One prompt** — paste `Read skill.md and follow the instructions` in any AI editor
- **6 core skills, 22 modules, 4 tracks** — Node, Python, Go, TypeScript
- **Adaptive memory** — your instructor remembers sessions and calibrates to your level
- **5-dimension evidence scoring** — proof of how you think, not just what you completed
- **Local-first with cloud sync** — works offline; register to sync progress across devices
- **Custom modules** — extend the curriculum with JSON files

---

## Quick start (local)

```bash
cd tutor
npm install
npm run dev          # Landing + dashboard at localhost:5173
npm run tutor -- start --skill system-design-fundamentals --track node
```

Optional API server (PostgreSQL):

```bash
cd server
cp .env.example .env   # set DATABASE_URL, JWT_SECRET
npm install
npm run dev            # API at localhost:3001
```

Then paste in your IDE:

```
Read skill.md and follow the instructions
```

---

## Deployment

### 1. Frontend — Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/shriansh1625/learnerslab)

Manual steps:

1. Import https://github.com/shriansh1625/learnerslab on [Vercel](https://vercel.com)
2. Framework preset: **Vite** (uses root `vercel.json`)
3. Set environment variable:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your Render API URL, e.g. `https://learnlab-api.onrender.com` |

4. Deploy — static site served from `tutor/dist`

### 2. Backend — Render

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect repo: `shriansh1625/learnerslab`
3. Render reads `render.yaml` and creates:
   - **learnlab-db** — PostgreSQL (free tier)
   - **learnlab-api** — Node.js web service
4. Set `FRONTEND_URL` on the API service to your Vercel URL (e.g. `https://learnerslab.vercel.app`)
5. `JWT_SECRET` is auto-generated; `DATABASE_URL` is wired from the database

Alternatively deploy manually:

- Create PostgreSQL database on Render or [Supabase](https://supabase.com)
- Create Web Service, root directory: `server`, build: `npm install`, start: `npm start`
- Add env vars below

### 3. Database setup

Schema auto-applies on first API boot via `server/db/schema.sql`.

**Tables:**

| Table | Purpose |
|-------|---------|
| `users` | Registration, login, profile (email, password_hash, name, degree, bio, username, college, track) |
| `user_sessions` | Active tutoring session (skill, module, step, hints) |
| `completed_modules` | Module completions with scores |
| `decisions` | DECIDE step choices and reasoning |
| `scores` | Dimension scores and narrative per module |
| `portfolio` | Evidence artifacts from REFLECT |
| `student_memory` | Adaptive tutor memory (JSON) |

Works with **Render Postgres** or **Supabase** — both use standard `DATABASE_URL`.

---

## LearnLab Instructor LLM

LearnLab does **not** ship a fine-tuned foundation model. Instead it includes a **project-exclusive instructor layer** — persona, guardrails, and context assembly wired to your curriculum and adaptive brain.

### What makes it exclusive to LearnLab

| Piece | Role |
|-------|------|
| **Persona** | Fixed system prompt (`tutor/lib/llm/prompts/instructor.system.md`) — LearnLab branding, local-first, evidence portfolio |
| **Guardrails** | Never writes full BUILD solutions; one step at a time; CONTEXT→DECIDE→BUILD→VERIFY→BREAK→FIX→REFLECT |
| **Context** | Pulls skill/module/step excerpts from `tutor/data/skills`, brain snapshot (BKT/SM-2), and student profile |
| **Overlay** | LLM enhances coach notes and hints; deterministic brain algorithms always run first |

### Architecture

```
tutor/lib/llm/          ← CLI + shared logic
server/lib/llm/         ← API mirror (keep in sync)
  LearnLabLLM.js        ← single entry: coach(), hint(), reflect(), decide()
  instructor.js         ← persona + guardrails
  context.js            ← curriculum + brain + profile assembly
  providers/groq.js       ← Groq default (openai/gpt-oss-120b)
```

### API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/llm/coach` | JWT | Brain-aware coach note for dashboard |
| POST | `/api/llm/hint` | optional JWT | Curriculum hint + LLM nudge |
| POST | `/api/llm/reflect` | optional JWT | Reflective question for REFLECT step |
| GET | `/api/llm/status` | — | Whether LLM overlay is enabled |

CLI: `npm run tutor -- hint` calls LearnLabLLM when `GROQ_API_KEY` (or fallback keys) is set locally.

---

## Self-Learning Instructor

LearnLab does **not** fine-tune Groq's GPT-OSS 120B weights — that requires proprietary training infrastructure. Instead, LearnLab runs a **continuous learning loop** exclusive to this project:

| What learns | How |
|-------------|-----|
| **Every LLM call** | Logged to `llm_interactions` (coach, hint, reflect, decide) with full context |
| **Explicit reactions** | 👍 / 👎 on coach notes → `llm_reactions` |
| **Implicit signals** | Module completed within 24h, VERIFY pass, session continued, fewer hints → auto-scored |
| **Few-shot bank** | High-scoring responses promoted and retrieved for similar future prompts |
| **Distilled patterns** | Every 10 reactions, Groq meta-prompt summarizes what worked → `llm_learned_patterns` |

### Learning loop

```
Student session → LearnLabLLM (inject patterns + few-shots) → response + interaction_id
       ↓
👍/👎 or brain event (verify, module_complete) → score interaction
       ↓
Promote winners → few-shot bank · Groq consolidate → new patterns
       ↓
Next student gets better hints/coach notes for this curriculum
```

### Storage

- **PostgreSQL** — `llm_interactions`, `llm_reactions`, `llm_learned_patterns` (auto-created from `schema.sql`)
- **Local mirror** — `tutor/data/sync/learning/` (gitignored; CLI + deploy backup)

### API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/learning/react` | optional JWT | `{ interactionId, reaction: helpful\|not_helpful }` |
| GET | `/api/learning/stats` | optional JWT | Pattern count, success rate, recent learnings |
| POST | `/api/learning/consolidate` | JWT | Trigger meta-learning batch (admin/cron) |

CLI: `npm run tutor -- learning stats --json`

### Honest limits

- No foundation weight fine-tuning — learning is **retrieval + prompt injection + pattern distillation**
- Cold start: needs reactions and outcomes before patterns appear
- Groq API required for meta-learning consolidation (inference already uses Groq when configured)

---

## Environment variables

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Random string for signing tokens |
| `FRONTEND_URL` | Yes (prod) | Vercel URL for CORS |
| `PORT` | No | Default `3001`; Render sets automatically |
| `LEARNLAB_LLM_ENABLED` | No | Set `false` to disable LLM overlay (heuristics only) |
| `GROQ_API_KEY` | No | Groq API key — enables LearnLab Instructor LLM (preferred when set) |
| `GROQ_MODEL` | No | Groq model ID; default `openai/gpt-oss-120b` |
| `OPENAI_API_KEY` | No | OpenAI key — used if Groq is not configured |
| `ANTHROPIC_API_KEY` | No | Anthropic key — used if Groq and OpenAI are not configured |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (prod) | Render API base URL, no trailing slash |

**Never commit `.env` files** — use `.env.example` as a template.

---

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Get JWT token |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/github` | — | Stub (501) |
| GET | `/api/progress` | JWT | Full user progress |
| PUT | `/api/progress/session` | JWT | Update active session |
| POST | `/api/progress/module-complete` | JWT | Record module completion |
| GET | `/api/leaderboard` | — | Top users by readiness |
| GET | `/api/profile/:username` | — | Public profile |
| GET | `/api/health` | — | Health check |
| GET | `/api/brain` | JWT | Adaptive brain state |
| POST | `/api/brain/coach` | JWT | Coach note (legacy; prefer `/api/llm/coach`) |
| POST | `/api/llm/coach` | JWT | LearnLab Instructor coach note |
| POST | `/api/llm/hint` | optional JWT | Hint nudge with curriculum context |
| POST | `/api/llm/reflect` | optional JWT | REFLECT question |
| GET | `/api/llm/status` | — | LLM overlay status |
| POST | `/api/learning/react` | optional JWT | Rate an instructor interaction |
| GET | `/api/learning/stats` | optional JWT | Self-learning stats |
| POST | `/api/learning/consolidate` | JWT | Trigger pattern distillation |

---

## CLI commands

```bash
npm run tutor -- status --json
npm run tutor -- catalog --json
npm run tutor -- start --skill system-design-fundamentals
npm run tutor -- score --json
npm run tutor -- share
npm run tutor -- profile
npm run tutor -- profile update --name "..." --degree "..." --bio "..."
npm run tutor -- profile confirm
npm run tutor -- pretest
npm run tutor -- pretest submit --answers "1A,2A,3A,4A,5A"
npm run tutor -- leaderboard
npm run tutor -- sync --publish
npm run tutor -- feedback --summary "..."
npm run tutor -- learning stats --json
```

---

## 6 Core Skills

1. **System Design Fundamentals** — Start here (Launchpad)
2. **Debugging & Incident Response**
3. **Decomposition & Execution Planning**
4. **Production Readiness**
5. **AI-Augmented Engineering**
6. **Technical Communication**

Plus **System Design (Advanced)** for scaling/caching.

---

## Project structure

```
skill.md              ← Universal IDE entry point
PROMPT.md             ← Copy-paste prompts per IDE
render.yaml           ← Render Blueprint (API + Postgres)
vercel.json           ← Vercel frontend config
server/               ← Express API + PostgreSQL
  db/schema.sql       ← Database tables
  routes/             ← auth, progress, profile, leaderboard
tutor/
  cli/                ← Session engine
  lib/llm/            ← LearnLab Instructor LLM (persona, context, providers)
  lib/brain/          ← BKT + SM-2 adaptive engine
  lib/learning/       ← Self-learning experience store + retrieval
  data/skills/        ← Curriculum (JSON modules)
  src/                ← Landing + dashboard + auth
server/lib/llm/       ← API mirror of tutor/lib/llm
```

---

## Git push (if auth fails)

If `git push` fails with authentication errors:

```bash
# Option A: GitHub CLI
gh auth login
git push origin main

# Option B: Personal Access Token
# Create at https://github.com/settings/tokens (repo scope)
git remote set-url origin https://YOUR_USERNAME:YOUR_TOKEN@github.com/shriansh1625/learnerslab.git
git push origin main
```

After pushing, connect Vercel and Render to the repo for automatic deploys.
