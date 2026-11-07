# Contributing to SynapSoul Learn

## Project Overview
[SynapSoul Learn](https://synapsoullearn.runs-on.dev/) turns terminal-enabled AI coding agents (Claude Code, Cursor, VS Code Copilot, and Codex) into interactive system design and production-engineering instructors via `skill.md`, the `synapsoul` CLI, and an on-device Cognitive Graph (`~/.synapsoul/learner/`).

## Four Ways to Contribute

1. **Authoring Guided Lab Modules**
   - Author new guided lab modules across the 7 skill paths:
     - `System Design Fundamentals`
     - `Debugging & Incident Response`
     - `Decomposition & Execution Planning`
     - `Production Readiness`
     - `AI-Augmented Engineering`
     - `Technical Communication`
     - `System Design Advanced`
   - Support across 4 language tracks: Node.js, Python, Go, TypeScript.

2. **Refining the Engineering Lab Loop & Scoring Rubrics**
   - Refine the 7-stage engineering lab loop: `01 CONTEXT → 02 DECIDE → 03 BUILD → 04 VERIFY → 05 BREAK → 06 FIX → 07 REFLECT`.
   - Enhance 5-dimension evidence scoring rubrics: Tradeoffs, Debugging, Security, Production Thinking, Communication.

3. **Improving the Local Learner & Cognitive Graph**
   - Work inside `tutor/` on Bayesian Knowledge Tracing, SM-2 spaced repetition, PageRank gap analysis, and ZPD frontier mapping.

4. **Improving CLI Installers & Editor Integrations**
   - Improve cross-platform CLI installers and editor integrations.

## Local Testing Rules
- Ensure local testing preserves backward compatibility with `~/.synapsoul/learner/` state.
- Test thoroughly before submitting changes.

## Commit Guidelines & Licensing
- Follow Conventional Commit guidelines (e.g., `docs: ...`, `feat: ...`, `fix: ...`, `chore: ...`).
- All contributions are distributed under the MIT License (`mit_license.md`).
