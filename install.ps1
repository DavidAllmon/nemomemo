# NemoMemo installer for Windows — https://trynemomemo.com
#
#   irm https://trynemomemo.com/install.ps1 | iex
#
# Runs the app in Docker (Desktop) with a persistent data volume. Re-running
# upgrades in place (the data volume is kept). Overridable via environment:
#   $env:NEMOMEMO_PORT / NEMOMEMO_VOLUME / NEMOMEMO_CONTAINER / NEMOMEMO_IMAGE
#
# Feature settings (email, OCR, transcripts, dictation) come from an env file —
# start from .env.example in the repo:
#   $env:NEMOMEMO_ENV_FILE='.\nemomemo.env'; irm https://trynemomemo.com/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$Port   = if ($env:NEMOMEMO_PORT)      { $env:NEMOMEMO_PORT }      else { '5230' }
$Volume = if ($env:NEMOMEMO_VOLUME)    { $env:NEMOMEMO_VOLUME }    else { 'nemomemo-data' }
$Name   = if ($env:NEMOMEMO_CONTAINER) { $env:NEMOMEMO_CONTAINER } else { 'nemomemo' }
$Image  = if ($env:NEMOMEMO_IMAGE)     { $env:NEMOMEMO_IMAGE }     else { 'ghcr.io/davidallmon/nemomemo:latest' }
$EnvFile = $env:NEMOMEMO_ENV_FILE
if ($EnvFile -and -not (Test-Path $EnvFile)) {
  Write-Host "🐡 No env file at $EnvFile. Create it (start from .env.example) or clear `$env:NEMOMEMO_ENV_FILE."
  exit 1
}

Write-Host "🐠 NemoMemo installer"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "🐡 Docker isn't installed. Install Docker Desktop first:"
  Write-Host "   https://docs.docker.com/desktop/setup/install/windows-install/"
  Write-Host "   then re-run:  irm https://trynemomemo.com/install.ps1 | iex"
  exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "🐡 Docker is installed but not running. Start Docker Desktop, then re-run this script."
  exit 1
}

$existing = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $Name }
if ($existing) {
  Write-Host "↻ found an existing '$Name' container — upgrading in place (your data volume is kept)"
  docker pull $Image
  docker rm -f $Name *> $null
} else {
  docker pull $Image
}

if ($EnvFile) {
  docker run -d --name $Name --restart unless-stopped -p "${Port}:5230" -v "${Volume}:/app/data" --env-file $EnvFile $Image *> $null
} else {
  docker run -d --name $Name --restart unless-stopped -p "${Port}:5230" -v "${Volume}:/app/data" $Image *> $null
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "🐡 docker run failed — is port $Port free? Pick another and re-run:"
  Write-Host "   `$env:NEMOMEMO_PORT='5231'; irm https://trynemomemo.com/install.ps1 | iex"
  exit 1
}

$started = $false
foreach ($i in 1..30) {
  try {
    $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:$Port/healthz"
    $started = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

Write-Host ""
if ($started) {
  Write-Host "  ✓ your reef is live at http://localhost:$Port"
} else {
  Write-Host "  container started; still waking up — check:  docker logs $Name"
  Write-Host "  it will be at http://localhost:$Port"
}
Write-Host ""
Write-Host "  · the first account you create becomes the reef keeper (admin)"
Write-Host "  · your data lives in the docker volume '$Volume' (one SQLite DB + uploads)"
Write-Host "  · to upgrade later, just re-run this script"
Write-Host ""
Write-Host "  just keep swimming 🫧"
