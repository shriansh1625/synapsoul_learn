# LearnLab student kit

This folder is everything you need to run the LearnLab tutor in any IDE.
You do **not** need GitHub access.

**Site:** https://tutor-alpha-sandy.vercel.app/
**API:** https://learnerslab.onrender.com
**Kit:** https://tutor-alpha-sandy.vercel.app/learnlab-kit.zip

## Setup (any IDE)

1. Unzip and **open this folder** in Cursor, Claude Code, VS Code Copilot, Codex, Antigravity, or another AI editor.
2. Copy the universal prompt from https://tutor-alpha-sandy.vercel.app/ and paste it into the agent chat.
3. In the terminal:

```powershell
cd tutor
npm install
node cli/index.mjs status --json
```

4. Point the CLI at production:

```powershell
$env:LEARNLAB_API_URL="https://learnerslab.onrender.com"
```

On bash:

```bash
export LEARNLAB_API_URL=https://learnerslab.onrender.com
```

5. Sign in at https://tutor-alpha-sandy.vercel.app/ so your progress returns to the cohort.

If no session yet: `node cli/index.mjs start --json`.

Do not clone a GitHub repository. This kit is the student workspace.
