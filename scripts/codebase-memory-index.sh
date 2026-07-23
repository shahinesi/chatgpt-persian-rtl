#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "Indexing codebase-memory-mcp: $ROOT"
codebase-memory-mcp cli index_repository "{\"repo_path\":\"$ROOT\",\"persistence\":true}"

if command -v code-review-graph >/dev/null 2>&1; then
  echo "Running code-review-graph build: $ROOT"
  (cd "$ROOT" && code-review-graph build)
else
  echo "code-review-graph command not found; skipping code-review-graph build"
fi

if command -v graphify >/dev/null 2>&1; then
  export OPENAI_API_KEY="BYNARA_API_KEY"
  export OPENAI_BASE_URL="https://router.bynara.id/v1"
  export OPENAI_MODEL="mistral-large"

  echo "Running graphify .: $ROOT"
  (cd "$ROOT" && graphify .)

  echo "Installing graphify hook: $ROOT"
  (cd "$ROOT" && graphify hook install)
else
  echo "graphify command not found; skipping graphify index/hook install"
fi
