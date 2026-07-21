#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/manifest.json').version")"
DIST="$ROOT/dist"
NAME="chatgpt-persian-rtl-v$VERSION.zip"

rm -rf "$DIST"
mkdir -p "$DIST"

cd "$ROOT"
zip -q -r "$DIST/$NAME" \
  manifest.json content.js styles.css popup.html popup.js icons fonts \
  -x '*.DS_Store'

printf 'Created %s\n' "$DIST/$NAME"
