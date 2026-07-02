$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"

if (!(Test-Path $Python)) {
  Write-Host "Creating Python virtual environment..."
  python -m venv (Join-Path $Root ".venv")
}

Write-Host "Installing Python requirements..."
& $Python -m pip install --upgrade pip
& $Python -m pip install -r (Join-Path $Root "requirements.txt")

Write-Host "Starting AI Memory Vault backend at http://127.0.0.1:7065"
& $Python -m uvicorn app.main:app --app-dir (Join-Path $Root "backend") --host 127.0.0.1 --port 7065
