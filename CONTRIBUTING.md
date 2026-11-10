# Contributing to SynapSoul Learn

[SynapSoul Learn](https://synapsoullearn.runs-on.dev/) is an MIT-licensed protocol, CLI, and curriculum that turns Claude Code, Cursor, VS Code Copilot, and Codex into an engineering instructor. Thank you for contributing.

The running system is `tutor/cli/`, `tutor/lib/`, `server/`, `skill.md`, and the installers. Please leave those alone unless an issue has already agreed the change is needed. New curriculum is the path that does not require an engine change.

## Add a lab module

1. Fork the repository and branch from `main`.
2. Pick a skill directory under `tutor/data/skills/`.
3. Copy a nearby module JSON. `tutor/data/skills/system-design-fundamentals/modules/http-basics.json` is a complete example.
4. Keep the same step keys: `CONTEXT`, `DECIDE`, `BUILD`, `VERIFY`, `BREAK`, `FIX`, `REFLECT`.
5. In `BUILD.tracks`, include `node`, `python`, `go`, and `typescript` when the skill manifest lists those tracks.
6. `BREAK` must name a concrete fault the student can observe. `REFLECT` must call back to the `DECIDE` choice.
7. Add the module to that skill's `manifest.json` `modules` array, with the same `id` as the file.
8. Open a pull request. Use a Conventional Commit title, for example `docs: add caching lab for system-design`.

Open a [new lab module issue](https://github.com/shriansh1625/synapsoul_learn/issues/new?template=new_lab_module.md) first if you want feedback on the scenario before writing the JSON.

Skill directories:

- `system-design-fundamentals`
- `debugging-incidents`
- `decomposition-planning`
- `production-readiness`
- `ai-augmented-engineering`
- `technical-communication`
- `system-design`
- `web-fundamentals`

## Other contributions

- **Rubrics and the lab loop.** The loop is `CONTEXT → DECIDE → BUILD → VERIFY → BREAK → FIX → REFLECT`. Scoring dimensions used in modules include tradeoff reasoning, debugging, security, production thinking, and communication. Propose rubric changes in an issue before editing the engine.
- **Local learner and cognitive graph.** Work in `tutor/lib/brain/` and `tutor/lib/learning/` only after an issue. Preserve compatibility with existing files in `~/.synapsoul/learner/`.
- **Installers and editor docs.** `install.sh`, `install.ps1`, and `skill.md` are the student entry path. A docs-only fix to README or CONTRIBUTING does not need an engine issue.
- **Bugs.** Use the [bug report template](https://github.com/shriansh1625/synapsoul_learn/issues/new?template=bug_report.md). Include the OS, the editor, the command you ran, and what you expected.

## Pull requests

- Branch from `main`.
- Describe the module or the bug, and how you checked it.
- If you change an API or a CLI flag, update [docs/operations.md](docs/operations.md) or the README in the same pull request.
- Do not commit `.env` files, API keys, or admin secrets.
- All contributions are under the [MIT License](LICENSE).

## Code of conduct

Participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).
