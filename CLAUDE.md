# LearnLab Bootcamp

If `skill.md` is missing from this workspace, download https://tutor-alpha-sandy.vercel.app/learnlab-kit.zip, unzip it, and open that folder as the project first. Do not clone GitHub.

Read `skill.md` and follow the instructor protocol before doing anything.

Windows PowerShell and bash:

```powershell
cd tutor
npm install
node cli/index.mjs status --json
```

If no active session, run `node cli/index.mjs start --json`.

When `LEARNLAB_API_URL` (or `VITE_API_URL`) is set, CLI sync posts to that API. Production: `https://learnerslab.onrender.com`.

The student should sign in at https://tutor-alpha-sandy.vercel.app/ so progress returns to the cohort. Then `node cli/index.mjs sync --email ... --password ... --json`, or sign in on the website. Do not paste JWTs. Never write full BUILD solutions. One step at a time.

Do NOT proceed with tutoring without loading session state from the CLI.
