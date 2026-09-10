---
name: synapsoul-learn-hub
description: SynapSoul Learn Hub owner workspace — students use the hosted protocol
version: 2.1.0
url: https://synapsoullearn.runs-on.dev/
---

# SynapSoul Learn Hub — Workspace note

If you are a **student**, ignore this file. Follow the hosted instructor protocol:

**https://synapsoullearn.runs-on.dev/skill.md**

Paste this in any AI editor:

```
Read https://synapsoullearn.runs-on.dev/skill.md and follow the instructions
```

Then install the CLI (no git clone, no zip):

- Unix: `curl -fsSL https://synapsoullearn.runs-on.dev/install | sh`
- Windows PowerShell: `irm https://synapsoullearn.runs-on.dev/install.ps1 | iex`

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
