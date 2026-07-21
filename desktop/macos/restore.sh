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

node bin/chatgpt-rtl-patcher.mjs --platform=macos --restore "$@"
