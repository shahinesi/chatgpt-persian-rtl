#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js پیدا نشد. برای نسخه توسعه، Node.js 20 یا بالاتر لازم است.\n' >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

LOG_FILE="$(mktemp)"
if node bin/chatgpt-rtl-patcher.mjs --platform=macos --restore "$@" 2>"$LOG_FILE"; then
  rm -f "$LOG_FILE"
  exit 0
fi

cat "$LOG_FILE" >&2
if grep -Eq 'EPERM|Operation not permitted|اجازه نوشتن' "$LOG_FILE"; then
  printf '\nبرای بازگردانی برنامه داخل /Applications دسترسی administrator لازم است. اجرای دوباره با sudo...\n' >&2
  rm -f "$LOG_FILE"
  sudo node bin/chatgpt-rtl-patcher.mjs --platform=macos --restore "$@"
  exit $?
fi

rm -f "$LOG_FILE"
exit 1
