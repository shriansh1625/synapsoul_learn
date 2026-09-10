#!/usr/bin/env sh
# SynapSoul Learn Hub installer — local-first AI engineering tutor
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TUTOR_DIR="$REPO_ROOT/tutor"

echo "◈ SynapSoul Learn Hub installer"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required. Install from https://nodejs.org"
  exit 1
fi

echo "→ Installing dependencies in tutor/"
cd "$TUTOR_DIR"
npm install --no-fund --no-audit

echo ""
echo "✓ SynapSoul Learn Hub installed successfully"
echo ""
echo "Next steps:"
echo "  1. cd tutor && npm run dev          # Landing + dashboard"
echo "  2. Paste in your AI editor:"
echo "     Read https://tutor-alpha-sandy.vercel.app/skill.md and follow the instructions"
echo ""
echo "CLI quick start:"
echo "  cd tutor && npm run synapsoul -- start --skill system-design-fundamentals"
echo ""
