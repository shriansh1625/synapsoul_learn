# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Learner State & Privacy

All local learner state files:
- `student_profile_digest.json`
- `interaction_chunks.jsonl`
- `learned_patterns_local.json`
- `graph.json`

are stored strictly locally on your machine at `~/.synapsoul/learner/`. Only anonymized digests are synced to `POST /api/learner/sync`.

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

To report a security vulnerability or security bug, please use one of the following private disclosure channels:
1. Submit a private report via **GitHub Security Advisories** on the repository [`shriansh1625/synapsoul_learn`](https://github.com/shriansh1625/synapsoul_learn).
2. Contact maintainer **[@shriansh1625](https://github.com/shriansh1625)** directly.

We commit to a **48-hour acknowledgment target** for all privately disclosed security reports.
