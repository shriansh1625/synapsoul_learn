# SynapSoul Learn Hub CLI installer for Windows. Downloads the student CLI only. Does not clone a repo.
$ErrorActionPreference = 'Stop'

function First-Env([string[]]$Names, [string]$Fallback) {
  foreach ($n in $Names) {
    $v = [Environment]::GetEnvironmentVariable($n, 'Process')
    if (-not $v) { $v = [Environment]::GetEnvironmentVariable($n, 'User') }
    if ($v -and $v.Trim()) { return $v.Trim().TrimEnd('/') }
  }
  return $Fallback
}

$Origin = First-Env @('SYNAPSOUL_ORIGIN', 'LEARNLAB_ORIGIN') 'https://synapsoullearn.runs-on.dev'
$Api = First-Env @('SYNAPSOUL_API_URL', 'LEARNLAB_API_URL') 'https://learnerslab.onrender.com'
$Site = First-Env @('SYNAPSOUL_SITE', 'LEARNLAB_SITE') 'https://synapsoullearn.runs-on.dev'

$homeOverride = First-Env @('SYNAPSOUL_HOME', 'LEARNLAB_HOME') ''
$synHome = Join-Path $HOME '.synapsoul'
$legacyHome = Join-Path $HOME '.learnlab'
if ($homeOverride) {
  $HomeDir = $homeOverride
} elseif (Test-Path $synHome) {
  $HomeDir = $synHome
} elseif (Test-Path $legacyHome) {
  $HomeDir = $legacyHome
} else {
  $HomeDir = $synHome
}

$TarballUrl = "$Origin/cli/learnlab-cli.tar.gz"

Write-Host "SynapSoul Learn Hub installer"
Write-Host "  CLI home: $HomeDir"
Write-Host "  API:      $Api"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "SynapSoul needs Node.js 18 or newer. Install it from https://nodejs.org then re-run: irm $Origin/install.ps1 | iex"
}

$major = [int]((node -p "process.versions.node.split('.')[0]") 2>$null)
if ($major -lt 18) {
  Write-Error "Node.js 18+ required (found $(node -v))."
}

New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $HomeDir 'bin') | Out-Null

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("synapsoul-cli-" + [guid]::NewGuid().ToString() + ".tar.gz")
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

$cmdBody = @(
  '@echo off'
  'setlocal'
  "if not defined SYNAPSOUL_HOME if not defined LEARNLAB_HOME set `"SYNAPSOUL_HOME=$HomeDir`""
  'if defined SYNAPSOUL_HOME (set "ROOT=%SYNAPSOUL_HOME%") else (set "ROOT=%LEARNLAB_HOME%")'
  "if not defined SYNAPSOUL_API_URL if not defined LEARNLAB_API_URL set `"SYNAPSOUL_API_URL=$Api`""
  'if not defined LEARNLAB_API_URL if defined SYNAPSOUL_API_URL set "LEARNLAB_API_URL=%SYNAPSOUL_API_URL%"'
  'node "%ROOT%\cli\index.mjs" %*'
)
$cmdPath = Join-Path $HomeDir 'bin\synapsoul.cmd'
Set-Content -Path $cmdPath -Value $cmdBody -Encoding ascii
Copy-Item $cmdPath (Join-Path $HomeDir 'bin\learnlab.cmd') -Force

$psBody = @(
  "`$root = if (`$env:SYNAPSOUL_HOME) { `$env:SYNAPSOUL_HOME } elseif (`$env:LEARNLAB_HOME) { `$env:LEARNLAB_HOME } else { '$HomeDir' }"
  "if (-not `$env:SYNAPSOUL_API_URL -and -not `$env:LEARNLAB_API_URL) { `$env:SYNAPSOUL_API_URL = '$Api' }"
  'if (-not $env:LEARNLAB_API_URL -and $env:SYNAPSOUL_API_URL) { $env:LEARNLAB_API_URL = $env:SYNAPSOUL_API_URL }'
  '& node (Join-Path $root ''cli\index.mjs'') @args'
)
$psPath = Join-Path $HomeDir 'bin\synapsoul.ps1'
Set-Content -Path $psPath -Encoding utf8 -Value $psBody
Copy-Item $psPath (Join-Path $HomeDir 'bin\learnlab.ps1') -Force

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
Write-Host "Installed. FIRST: register or login (do not start lessons until the CLI has a JWT)."
Write-Host "  synapsoul register --email you@college.edu --password YOUR_PASSWORD --name `"Your Name`""
Write-Host "  synapsoul login --email you@college.edu --password YOUR_PASSWORD"
Write-Host "  synapsoul login --github"
Write-Host "Or register at $Site then synapsoul login --email …"
Write-Host ""
Write-Host "Then:"
Write-Host "  synapsoul start"
Write-Host ""
Write-Host "If this window was already open, restart the terminal or run:"
Write-Host "  & `"$cmdPath`" login"
Write-Host ""
Write-Host "Protocol: $Site/skill.md"
