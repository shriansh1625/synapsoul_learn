# SynapSoul Learn Hub — Universal IDE Prompt

Copy **one** line into your AI editor:

```
Read https://synapsoullearn.runs-on.dev/skill.md and follow the instructions. Run synapsoul login then synapsoul start --json before teaching. Never invent CONTEXT from memory.
```

Works with **Cursor**, **Claude Code**, **VS Code Copilot**, **Codex**, and any agent that can read a URL and run a terminal.

Site: https://synapsoullearn.runs-on.dev/
Protocol: https://synapsoullearn.runs-on.dev/skill.md
API: https://learnerslab.onrender.com

## Install CLI (no git clone)

Unix / macOS / Git Bash / WSL:

```bash
curl -fsSL https://synapsoullearn.runs-on.dev/install | sh
```

Windows PowerShell:

```powershell
irm https://synapsoullearn.runs-on.dev/install.ps1 | iex
```

Then:

```bash
synapsoul register --email you@college.edu --password YOUR_PASSWORD --name "Your Name"
synapsoul login --email you@college.edu --password YOUR_PASSWORD --json
synapsoul login --github
synapsoul start --json
```

The instructor must register or log in **before teaching**. Never invent CONTEXT from memory. Signing in on the website is not the CLI.

Sign in at https://synapsoullearn.runs-on.dev/ so website last_seen returns to the cohort API.
