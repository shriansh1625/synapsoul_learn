# LearnLab — The Open Engineering Bootcamp in Your IDE

**Your AI editor becomes your private engineering instructor.**

Paste one prompt. Get a tutor that remembers how you learn, adapts to your level, and builds proof of how you think — all local, all yours.

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
- **Local-first** — no GitHub login, no cloud lock-in; your repo holds your progress
- **Custom modules** — extend the curriculum with JSON files

---

## Quick start

```bash
cd tutor
npm install
npm run dev          # Landing + dashboard at localhost:5173
npm run tutor -- start --skill system-design-fundamentals --track node
```

Then paste in your IDE:
```
Read skill.md and follow the instructions
```

---

## CLI commands

```bash
npm run tutor -- status --json
npm run tutor -- catalog --json
npm run tutor -- start --skill system-design-fundamentals
npm run tutor -- score --json              # Dimension feedback template (no advance)
npm run tutor -- share                     # LinkedIn/Twitter markdown snippet
npm run tutor -- profile
npm run tutor -- profile update --name "..." --degree "..." --bio "..."
npm run tutor -- profile confirm
npm run tutor -- pretest
npm run tutor -- pretest submit --answers "1A,2A,3A,4A,5A"
npm run tutor -- leaderboard
npm run tutor -- sync --publish
npm run tutor -- feedback --summary "..."
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

## Hosting your prompt remotely

Push to GitHub, then share:

```
Read https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/skill.md and follow the instructions
```

Or serve locally: `http://localhost:5173/skill.md` when dev server runs.

---

## Project structure

```
skill.md              ← Universal IDE entry point
PROMPT.md             ← Copy-paste prompts per IDE
AGENTS.md / CLAUDE.md ← Auto-bootstrap rules
tutor/
  cli/                ← Session engine
  data/skills/        ← Curriculum (JSON modules)
  public/skill.md     ← Served at /skill.md
  src/                ← Landing + dashboard
```
