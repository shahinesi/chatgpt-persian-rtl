#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "Indexing codebase-memory-mcp: $ROOT"
codebase-memory-mcp cli index_repository "{\"repo_path\":\"$ROOT\",\"persistence\":true}"
