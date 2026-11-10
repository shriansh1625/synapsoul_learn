# SynapSoul Learn

MIT-licensed engineering bootcamp that runs inside Claude Code, Cursor, VS Code Copilot, and Codex.

One public protocol (`skill.md`), a `synapsoul` CLI, and curriculum JSON turn the editor into an instructor. The tutor follows a fixed loop, reads the module instead of inventing the lesson, and keeps a local record of how this student reasoned. The hosted site is a way to run that same protocol.

**Site:** https://synapsoullearn.runs-on.dev/
**Protocol:** https://synapsoullearn.runs-on.dev/skill.md
**Repository:** https://github.com/shriansh1625/synapsoul_learn
**License:** [MIT](LICENSE)

This repository is the public project. It is an early beta maintained by [@shriansh1625](https://github.com/shriansh1625). Interfaces and curriculum can still change. This page describes what is in the repo. It does not claim registry downloads, dependent packages, or outside contributors.

## The gap

Coding agents already answer questions while someone is learning to build. What they do not keep is a private, inspectable record of the decisions, failed checks, and fixes from that session, or a curriculum the tutor is required to follow. SynapSoul Learn is that protocol. Session state stays on the machine under `~/.synapsoul/`. People who never sign in are not silently tracked. Public profiles are opt-in.

## Try it

Works in any editor that can read a URL and run terminal commands. The landing-page copy button uses this prompt:

```
Read https://synapsoullearn.runs-on.dev/skill.md and follow the instructions. Run synapsoul login then synapsoul start --json before teaching. Never invent CONTEXT from memory.
```

Install the CLI:

```bash
curl -fsSL https://synapsoullearn.runs-on.dev/install | sh
```

Windows PowerShell:

```powershell
irm https://synapsoullearn.runs-on.dev/install.ps1 | iex
```

```bash
synapsoul register --email you@example.com --password your-password --name "Your Name"
synapsoul login --email you@example.com --password your-password --json
synapsoul login --github
synapsoul start
```

Sign in at https://synapsoullearn.runs-on.dev/ so progress can return to the cohort API. Do not put admin email, Gmail credentials, or admin OTP details in the prompt or on the landing page.

## What a session does

Every module walks the same loop:

`CONTEXT → DECIDE → BUILD → VERIFY → BREAK → FIX → REFLECT`

The instructor does not write the full BUILD solution. Deterministic records update first. An optional language-model overlay can add a hint after that. The overlay is not a fine-tuned foundation model.

| Record | Where it lives |
| --- | --- |
| Session | `~/.synapsoul/session.json` |
| Local learner | `~/.synapsoul/learner/` |
| Concept graph | `graph.json` inside the learner directory |

The local learner reads SynapSoul activity only: CLI commands, profile, brain snapshot, hint use, decisions, scores, and completed modules. It does not read IDE keystrokes or arbitrary project files. `synapsoul learn status --json` and `synapsoul graph --json` print the local record. An anonymized digest can be posted with `synapsoul sync`.

The cognitive graph stores Bayesian Knowledge Tracing estimates per concept, SM-2 review dates, and which weak concepts block later modules. The next module is chosen as productive struggle for this student.

## What is open in this repository

| Path | Role |
| --- | --- |
| `skill.md` | Protocol an editor reads before teaching |
| `install.sh`, `install.ps1` | CLI installers |
| `tutor/cli/` | `synapsoul` session engine |
| `tutor/data/skills/` | Curriculum. Each module is one JSON file |
| `tutor/lib/brain/` | BKT, SM-2, and the cognitive graph |
| `tutor/lib/learning/` | On-device learner |
| `tutor/src/` | Landing page and dashboard |
| `server/` | Cohort API and PostgreSQL schema |
| `docs/operations.md` | Deploy, environment, OAuth, and admin notes |

Students can use the hosted installer and do not need a GitHub seat. Contributors who want to extend the curriculum work in this repository.

## Curriculum in the tree

Core skills named by the product:

1. System Design Fundamentals (`system-design-fundamentals`) — start here
2. Debugging & Incident Response (`debugging-incidents`)
3. Decomposition & Execution Planning (`decomposition-planning`)
4. Production Readiness (`production-readiness`)
5. AI-Augmented Engineering (`ai-augmented-engineering`)
6. Technical Communication (`technical-communication`)

Also in `tutor/data/skills/`: `system-design` (caching) and `web-fundamentals`. Tracks on the fundamentals manifest: Node, Python, Go, TypeScript. Module files are the source of truth. Open a manifest such as `tutor/data/skills/system-design-fundamentals/manifest.json` to see the ordered list.

A module JSON has `CONTEXT`, `DECIDE`, `BUILD` (with a track for each language), `VERIFY`, `BREAK`, `FIX`, and `REFLECT`. `http-basics.json` is a complete example.

## Run it locally

```bash
cd tutor
npm install
npm run dev          # Landing + dashboard at localhost:5173
node cli/index.mjs start --skill system-design-fundamentals --track node
```

Optional API (PostgreSQL):

```bash
cd server
cp .env.example .env   # set DATABASE_URL, JWT_SECRET
npm install
npm run dev            # API at localhost:3001
```

Deploy steps, environment variables, the API table, OAuth, and the admin dashboard are in [docs/operations.md](docs/operations.md).

## Contributing

The contribution that helps most is a new lab module: one JSON file plus a manifest entry, using an existing module as the template. That path does not require changes to the CLI, the brain, or the API.

Engine changes under `tutor/cli/`, `tutor/lib/`, and `server/` need an issue first, with a reason and a compatibility note for existing `~/.synapsoul/learner/` state. See [CONTRIBUTING.md](CONTRIBUTING.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues in private, as described in [SECURITY.md](SECURITY.md).

## Maintainer

[Shriansh Vikram Singh](https://github.com/shriansh1625) / [SynapSoul Labs](https://synapsoulai.me/)
