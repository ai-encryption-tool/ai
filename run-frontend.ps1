$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Frontend = Join-Path $Root "frontend"

Set-Location $Frontend

if (!(Test-Path (Join-Path $Frontend "node_modules"))) {
  Write-Host "Installing frontend packages..."
  npm install
}

Write-Host "Starting AI Memory Vault dashboard at http://127.0.0.1:7066"
npm run dev -- --host 127.0.0.1 --port 7066
