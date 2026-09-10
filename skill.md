---
name: synapsoul-learn-hub
description: SynapSoul Learn Hub owner workspace — students use the hosted protocol
version: 2.1.0
url: https://tutor-alpha-sandy.vercel.app/
---

# SynapSoul Learn Hub — Workspace note

If you are a **student**, ignore this file. Follow the hosted instructor protocol:

**https://tutor-alpha-sandy.vercel.app/skill.md**

Paste this in any AI editor:

```
Read https://tutor-alpha-sandy.vercel.app/skill.md and follow the instructions
```

Then install the CLI (no git clone, no zip):

- Unix: `curl -fsSL https://tutor-alpha-sandy.vercel.app/install | sh`
- Windows PowerShell: `irm https://tutor-alpha-sandy.vercel.app/install.ps1 | iex`

Then: `synapsoul login` → `synapsoul start`

---

If you are the **owner** working in this private repo, keep using the local CLI:

```powershell
cd tutor
npm install
node cli/index.mjs status --json
```

Same engine as the student `synapsoul` binary. Default production API: `https://learnerslab.onrender.com`.

Do not invent curriculum. One step at a time. Never write full BUILD solutions.
