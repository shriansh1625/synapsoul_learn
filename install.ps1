# SynapSoul Learn Hub installer (Windows)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TutorDir = Join-Path $RepoRoot "tutor"

Write-Host "◈ SynapSoul Learn Hub installer" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is required. Install from https://nodejs.org"
}

Write-Host "→ Installing dependencies in tutor/"
Set-Location $TutorDir
npm install --no-fund --no-audit

Write-Host ""
Write-Host "✓ SynapSoul Learn Hub installed successfully" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. cd tutor; npm run dev"
Write-Host "  2. Paste in your AI editor:"
Write-Host "     Read https://tutor-alpha-sandy.vercel.app/skill.md and follow the instructions"
Write-Host ""
Write-Host "CLI: cd tutor; npm run synapsoul -- start --skill system-design-fundamentals"
