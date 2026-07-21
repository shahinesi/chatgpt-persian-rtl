$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js پیدا نشد. برای نسخه توسعه، Node.js 20 یا بالاتر لازم است."
}

if (-not (Test-Path "node_modules")) {
  npm install
}

node bin/chatgpt-rtl-patcher.mjs --platform=windows --restore @args
