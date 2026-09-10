# LearnLab CLI installer for Windows. Downloads the student CLI only. Does not clone a repo.
$ErrorActionPreference = 'Stop'

$Origin = if ($env:LEARNLAB_ORIGIN) { $env:LEARNLAB_ORIGIN.TrimEnd('/') } else { 'https://tutor-alpha-sandy.vercel.app' }
$Api = if ($env:LEARNLAB_API_URL) { $env:LEARNLAB_API_URL.TrimEnd('/') } else { 'https://learnerslab.onrender.com' }
$Site = if ($env:LEARNLAB_SITE) { $env:LEARNLAB_SITE.TrimEnd('/') } else { 'https://tutor-alpha-sandy.vercel.app' }
$HomeDir = if ($env:LEARNLAB_HOME) { $env:LEARNLAB_HOME } else { Join-Path $HOME '.learnlab' }
$TarballUrl = "$Origin/cli/learnlab-cli.tar.gz"

Write-Host "LearnLab installer"
Write-Host "  CLI home: $HomeDir"
Write-Host "  API:      $Api"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "LearnLab needs Node.js 18 or newer. Install it from https://nodejs.org then re-run: irm $Origin/install.ps1 | iex"
}

$major = [int]((node -p "process.versions.node.split('.')[0]") 2>$null)
if ($major -lt 18) {
  Write-Error "Node.js 18+ required (found $(node -v))."
}

New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HomeDir 'bin') | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("learnlab-cli-" + [guid]::NewGuid().ToString() + ".tar.gz")
Write-Host "Downloading CLI from $TarballUrl"
Invoke-WebRequest -Uri $TarballUrl -OutFile $tmp -UseBasicParsing
tar -xzf $tmp -C $HomeDir
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

$installedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
$config = @{
  standalone = $true
  apiUrl = $Api
  siteUrl = $Site
  origin = $Origin
  installedAt = $installedAt
} | ConvertTo-Json
Set-Content -Path (Join-Path $HomeDir 'config.json') -Value $config -Encoding utf8

$cmdPath = Join-Path $HomeDir 'bin\learnlab.cmd'
@(
  '@echo off'
  'setlocal'
  'if not defined LEARNLAB_HOME set "LEARNLAB_HOME=%USERPROFILE%\.learnlab"'
  'if not defined LEARNLAB_API_URL set "LEARNLAB_API_URL=https://learnerslab.onrender.com"'
  'node "%LEARNLAB_HOME%\cli\index.mjs" %*'
) | Set-Content -Path $cmdPath -Encoding ascii

$psPath = Join-Path $HomeDir 'bin\learnlab.ps1'
@(
  '$root = if ($env:LEARNLAB_HOME) { $env:LEARNLAB_HOME } else { Join-Path $HOME ''.learnlab'' }'
  'if (-not $env:LEARNLAB_API_URL) { $env:LEARNLAB_API_URL = ''https://learnerslab.onrender.com'' }'
  '& node (Join-Path $root ''cli\index.mjs'') @args'
) | Set-Content -Path $psPath -Encoding utf8

$binDir = Join-Path $HomeDir 'bin'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
$parts = $userPath -split ';' | Where-Object { $_ -and $_.Trim() }
if ($parts -notcontains $binDir) {
  $newPath = if ($userPath.Trim()) { "$userPath;$binDir" } else { $binDir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  Write-Host "Added $binDir to your user PATH."
}
$env:Path = "$binDir;$env:Path"

Write-Host ""
Write-Host "Installed. Next:"
Write-Host "  learnlab login"
Write-Host "  learnlab start"
Write-Host ""
Write-Host "If this window was already open, restart the terminal or run:"
Write-Host "  & `"$cmdPath`" login"
Write-Host ""
Write-Host "Protocol: $Site/skill.md"
Write-Host "Sign in at $Site so progress returns to $Api"
