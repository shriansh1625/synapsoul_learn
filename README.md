# LearnLab — The Open Engineering Bootcamp in Your IDE

**Your AI editor becomes your private engineering instructor.**

Paste one prompt. Get a tutor that remembers how you learn, adapts to your level, and builds proof of how you think.

**GitHub:** https://github.com/shriansh1625/learnerslab

## Universal Prompt (any IDE)

Works with **Cursor**, **Claude Code**, **VS Code Copilot**, **Codex**, **Antigravity**, and any AI editor that can read files and run terminal commands.

A friend opens https://tutor-alpha-sandy.vercel.app/, copies the prompt, clones https://github.com/shriansh1625/learnerslab, pastes the prompt in their IDE, then signs in on the site so progress returns to the cohort API.

The landing **Copy** button uses the full prompt below (also in [PROMPT.md](PROMPT.md)).

```
You are the LearnLab engineering instructor. Use LearnLab branding only.

If skill.md is missing from this workspace, clone the public repo first:
git clone https://github.com/shriansh1625/learnerslab.git
Then open that folder as the project.

1. Read skill.md at the project root and follow the instructor protocol exactly.
2. Install dependencies and load session state. Windows PowerShell and bash both work:
     cd tutor
     npm install
     node cli/index.mjs status --json
3. Point CLI sync at production: LEARNLAB_API_URL=https://learnerslab.onrender.com
4. The student should create an account or sign in at https://tutor-alpha-sandy.vercel.app/
5. Never write full BUILD solutions. One step at a time.
```

Do **not** put `ADMIN_EMAIL`, Gmail credentials, or admin OTP details in the prompt or on the landing page.

---

## Why LearnLab

- **One prompt** — copy from the landing page; works in Cursor, Claude, VS Code Copilot, and other IDEs
- **6 core skills, 22 modules, 4 tracks** — Node, Python, Go, TypeScript
- **Adaptive memory** — your instructor remembers sessions and calibrates to your level
- **5-dimension evidence scoring** — proof of how you think, not just what you completed
- **Local-first with cloud sync** — works offline; register on the site so progress returns to the cohort API
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

Then paste the universal prompt from the landing page into your IDE.

---

## How a friend uses LearnLab

1. Open https://tutor-alpha-sandy.vercel.app/ and copy the universal prompt.
2. Clone https://github.com/shriansh1625/learnerslab and open that folder in Cursor, Claude Code, VS Code Copilot, or another AI editor.
3. Paste the prompt. The agent clones if needed, reads `skill.md`, installs the CLI, and teaches one step at a time.
4. Create an account or sign in on the site (email or GitHub). Then either stay on the dashboard or run:

```powershell
cd tutor
$env:LEARNLAB_API_URL="https://learnerslab.onrender.com"
node cli/index.mjs sync --email you@example.com --password your-password --json
```

The website is the source of truth for the cohort. Do not paste JWTs into chat.

People who never sign in are not silently tracked. Public hiring profiles stay opt-in public.

---

## Admin cohort dashboard (private)

Students never see this page. It is not in public nav or on the landing page. Only `omshriansh16@gmail.com` can be admin.

1. On the Render API service **learnlab-api** (`learnerslab.onrender.com`), set:

   | Variable | Value |
   |----------|-------|
   | `ADMIN_EMAIL` | `omshriansh16@gmail.com` |
   | `RESEND_API_KEY` | Resend API key (see below). **Never commit this.** |
   | `RESEND_FROM` | `LearnLab <onboarding@resend.dev>` until you verify a domain |

2. Register or sign in on https://tutor-alpha-sandy.vercel.app/ with **that Gmail** and **your own password**. LearnLab does not set or invent an admin password. GitHub sign-in also works if the GitHub email is that address. `is_admin` is set automatically for that email only.
3. Open https://tutor-alpha-sandy.vercel.app/admin (or `/#/admin`).
4. Click **Send code to Gmail**, then enter the 6-digit code. Codes expire in 10 minutes. You can request a new code at most once per 60 seconds. The code is sent over HTTPS (Resend), not SMTP; it still arrives in the Gmail inbox.
5. After verify, the cohort dashboard loads. The OTP session lasts 12 hours or until logout.

Anyone else who opens `/admin` sees the same 404 as an unknown page. There is no `ADMIN_SECRET` elevate path.

To free `UNIQUE(email)` after a mistaken signup (owner-only, not an HTTP endpoint): paste the Render Postgres URL into `server/.env`, then `cd server` and `$env:EMAIL="omshriansh16@gmail.com"; node scripts/delete-user.mjs` (bash: `EMAIL=omshriansh16@gmail.com node scripts/delete-user.mjs`). Never commit `.env`.

The dashboard lists every student (name, email, username, last seen, modules, track, readiness, GitHub) and opens private progress, brain, and profile. Password hashes are never returned. OTP codes are stored hashed; plaintext is never saved.

Unauthenticated or non-admin callers of `/api/admin/*` receive **404 Not found** (not 403). If the JWT is the admin email but OTP is not verified, admin APIs return **401** with `{ "code": "OTP_REQUIRED" }`.

### Admin OTP email (Resend over HTTPS)

Render **blocks outbound SMTP** on ports **587** and **465**, so Gmail SMTP is not the main path on `learnlab-api`. Admin codes are sent with the [Resend](https://resend.com) HTTPS API. The email still arrives in the Gmail inbox for `omshriansh16@gmail.com`.

1. Create a free account at [resend.com](https://resend.com) (use `omshriansh16@gmail.com` so you can send to that inbox before verifying a domain).
2. Open **API Keys** and create a key.
3. On **Render** → **learnlab-api** (`learnerslab.onrender.com`) → **Environment**, set `RESEND_API_KEY` to that key. Optionally set `RESEND_FROM=LearnLab <onboarding@resend.dev>`.
4. **Redeploy** learnlab-api. Env vars on Vercel do nothing for OTP email.

Until you verify a domain, keep `from` as `LearnLab <onboarding@resend.dev>`. Gmail SMTP (`GMAIL_APP_PASSWORD`) is an optional fallback only if Resend is unset **and** outbound SMTP happens to work. Do not treat SMTP as the production path.

If `RESEND_API_KEY` is missing, `/api/admin/otp/request` returns **503** with those setup steps to the admin UI only. Students never see that message.

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
6. On **learnlab-api** (not Vercel), set `ADMIN_EMAIL=omshriansh16@gmail.com` and `RESEND_API_KEY` (Resend HTTPS mailer). Render blocks SMTP ports 587/465; do not rely on `GMAIL_APP_PASSWORD` in production.

Alternatively deploy manually:

- Create PostgreSQL database on Render or [Supabase](https://supabase.com)
- Create Web Service, root directory: `server`, build: `npm install`, start: `npm start`
- Add env vars below

### 3. Database setup

Schema auto-applies on first API boot via `server/db/schema.sql`.

**Tables:**

| Table | Purpose |
|-------|---------|
| `users` | Registration, login, hiring profile (name, bio, headline, degree, college, location, website, GitHub, LinkedIn, public flag) |
| `user_sessions` | Active tutoring session (skill, module, step, hints) |
| `completed_modules` | Module completions with scores |
| `decisions` | DECIDE step choices and reasoning |
| `scores` | Dimension scores and narrative per module |
| `portfolio` | Evidence artifacts from REFLECT |
| `student_memory` | Adaptive tutor memory (JSON) |
| `admin_otps` | Hashed Gmail OTP codes for the single admin (never plaintext) |
| `admin_sessions` | OTP-verified admin sessions (hashed token, 12h) |

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
| `GITHUB_CLIENT_ID` | No | GitHub OAuth App client ID. If unset, GitHub buttons show a setup state (no 501 crash) |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth App client secret. **Never commit this.** |
| `GITHUB_CALLBACK_URL` | No | Must match the OAuth App callback, e.g. `https://learnerslab.onrender.com/api/auth/github/callback` |
| `LINKEDIN_CLIENT_ID` | No | Optional LinkedIn OAuth. Pasted LinkedIn URLs always work without this |
| `LINKEDIN_CLIENT_SECRET` | No | LinkedIn OAuth secret. **Never commit this.** |
| `LINKEDIN_CALLBACK_URL` | No | e.g. `https://learnerslab.onrender.com/api/auth/linkedin/callback` |
| `ADMIN_EMAIL` | Yes (prod, for cohort admin) | Hard-locked default: `omshriansh16@gmail.com`. Server-only. Never put this in `VITE_*`. |
| `RESEND_API_KEY` | Yes (prod, for admin OTP) | Resend HTTPS API key. Set on Render `learnlab-api` only — not Vercel. **Never commit this.** |
| `RESEND_FROM` | No | Default `LearnLab <onboarding@resend.dev>` until a domain is verified. |
| `GMAIL_USER` | No | Optional SMTP fallback username. Render blocks 587/465. |
| `GMAIL_APP_PASSWORD` | No | Optional SMTP fallback only. **Never commit this.** Do not use as the main path. |

### Frontend (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes (prod) | Render API base URL, no trailing slash |

**Never commit `.env` files** — use `.env.example` as a template.

---

## GitHub OAuth setup (hiring profiles)

Public hiring profiles can show a GitHub button and let builders sign in or connect GitHub. LinkedIn works as a pasted URL even when OAuth is off.

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. Application name: `LearnLab`
3. Homepage URL: your Vercel origin, e.g. `https://tutor-alpha-sandy.vercel.app`
4. Authorization callback URL: `https://learnerslab.onrender.com/api/auth/github/callback` (your Render API origin + `/api/auth/github/callback`)
5. Copy the Client ID. Generate a Client Secret.
6. On the Render API service, set:

| Variable | Example |
|----------|---------|
| `GITHUB_CLIENT_ID` | from the OAuth App |
| `GITHUB_CLIENT_SECRET` | from the OAuth App |
| `GITHUB_CALLBACK_URL` | `https://learnerslab.onrender.com/api/auth/github/callback` |
| `FRONTEND_URL` | `https://tutor-alpha-sandy.vercel.app` |

7. Redeploy the API. Sign-in shows **Continue with GitHub**. The in-app Profile page shows **Connect GitHub**.

If those env vars are missing, GitHub buttons stay visible in a setup state. They do not return HTTP 501.

### LinkedIn (optional)

Paste a public LinkedIn URL on the Profile editor anytime (`PUT /api/profile` field `linkedin_url`). To also offer LinkedIn OAuth:

1. Create a LinkedIn app with Sign In with LinkedIn using OpenID Connect
2. Redirect URL: `https://learnerslab.onrender.com/api/auth/linkedin/callback`
3. Set `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_CALLBACK_URL` on Render

### Public profile URLs

- Canonical: `https://tutor-alpha-sandy.vercel.app/u/{username}` (Vercel rewrite → SPA)
- Hash fallback: `https://tutor-alpha-sandy.vercel.app/#/u/{username}`
- Copy link always copies the full origin URL (`origin/u/{username}`)

Owners edit from the in-app **Profile** tab. Recruiters only see the public page.

The public slug is the **`username` field saved on the server** (via **Save public profile**), not your display name or unsaved form text. GitHub sign-in assigns an auto username (often from your GitHub handle); change it in the editor and save to publish `/u/your-slug`. Until save, `/u/{old-username}` may still work while `/u/{draft}` returns 404.

---

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Get JWT token |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/auth/providers` | — | `{ github, linkedin }` configured flags |
| GET | `/api/auth/github` | optional token | Start GitHub OAuth (login or `?connect=1&token=`) |
| GET | `/api/auth/github/callback` | — | GitHub OAuth callback |
| GET | `/api/auth/linkedin` | optional token | Start LinkedIn OAuth if configured |
| GET | `/api/auth/linkedin/callback` | — | LinkedIn OAuth callback |
| PUT | `/api/profile` | JWT | Update hiring profile (name, bio, headline, degree, college, username, location, website, LinkedIn, GitHub) |
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
| PUT | `/api/progress/sync` | JWT | Bulk CLI/web progress + brain upsert |
| GET | `/api/admin/overview` | JWT + admin OTP session | Cohort counts (404 if not admin; 401 `OTP_REQUIRED` if OTP missing) |
| GET | `/api/admin/students` | JWT + admin OTP session | Student list, no password hashes |
| GET | `/api/admin/students/:id` | JWT + admin OTP session | Private progress, brain, events, profile |
| POST | `/api/admin/otp/request` | JWT + admin email | Email a unique 6-digit OTP via Resend HTTPS (60s rate limit) |
| POST | `/api/admin/otp/verify` | JWT + admin email | Verify OTP; returns 12h session token |
| POST | `/api/admin/otp/logout` | JWT + admin email | Invalidate the current OTP session |

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
npm run tutor -- sync --email you@example.com --password your-password --json
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

## Autonomous live testing

Repeatable audits against **production** (or override URLs with env vars). Simulates a student API journey and a headless browser path through the landing page and dashboard.

| Variable | Default |
|----------|---------|
| `LEARNLAB_API_URL` | `https://learnerslab.onrender.com` |
| `LEARNLAB_FRONTEND_URL` | `https://tutor-alpha-sandy.vercel.app` |

```bash
cd tutor
npm install
npx playwright install chromium   # first time only (or: npm run playwright:install)

npm run test:live:api             # health, auth, brain, coach, learning loop
npm run test:live:e2e             # Playwright journey on Vercel (runs playwright:install via pretest)
npm run test:live                 # API then E2E, in sequence
```

From repo root: `npm run test:live`.

Reports (gitignored): `test-results/live-audit-latest.json`, plus `live-audit-api.json` and `live-audit-e2e.json`. API audit registers `audit-live-<timestamp>@test.local` users; there is no delete-user endpoint, so those rows remain in the database.

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
