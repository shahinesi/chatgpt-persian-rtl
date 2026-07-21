#!/usr/bin/env bash
set -uo pipefail

ASAR="/Applications/ChatGPT.app/Contents/Resources/app.asar"
BACKUP="${ASAR}.chatgpt-persian-rtl.bak"
PATCHER="$(cd "$(dirname "$0")" && pwd)/chatgpt-rtl-patcher.mjs"
EXTRACT_DIR="$(mktemp -d)"
PASS=0
FAIL=0
RESULTS=()
_GOT_FATAL=0

abort() {
  _GOT_FATAL=1
  printf '\n\033[31mFATAL: %s\033[0m\n' "$1" >&2
  rm -rf "$EXTRACT_DIR"
  exit 1
}

cleanup() { rm -rf "$EXTRACT_DIR"; }
trap cleanup EXIT

run_node_list() {
  node "$PATCHER" --list "$1" 2>/dev/null
}

check() {
  local label="$1" result="$2"
  if [[ "$result" == "pass" ]]; then
    printf '  \033[32m✓\x1b[0m %s\n' "$label"
    PASS=$((PASS + 1))
  else
    printf '  \033[31m✗\x1b[0m %s: %s\n' "$label" "$result"
    FAIL=$((FAIL + 1))
  fi
  RESULTS+=("$label|$result")
}

# --- Preflight ---
[[ -f "$ASAR" ]]            || abort "app.asar not found: $ASAR"
[[ -f "$BACKUP" ]]          || abort "Backup not found: $BACKUP"
command -v node >/dev/null 2>&1 || abort "node not found"

# --- Step 1: Restore clean asar ---
printf '\n\033[36m[1/6] Restoring clean backup...\033[0m\n'
sudo cp "$BACKUP" "$ASAR" || abort "Failed to restore backup"

# --- Step 2: Apply patch ---
printf '\n\033[36m[2/6] Applying patch...\033[0m\n'
node "$PATCHER" --platform=macos || abort "Patcher failed"

# --- Step 3: Extract patched asar ---
printf '\n\033[36m[3/6] Extracting patched asar...\033[0m\n'
node --input-type=module -e "
import { extractAll } from '@electron/asar';
extractAll('$ASAR', '$EXTRACT_DIR');
" || abort "asar extract failed"

# --- Step 4: Get expected targets from --list ---
printf '\n\033[36m[4/6] Comparing --list targets...\033[0m\n'
EXPECTED_CLEAN="$(mktemp)"
EXPECTED_PATCHED="$(mktemp)"
trap 'rm -rf "$EXTRACT_DIR" "$EXPECTED_CLEAN" "$EXPECTED_PATCHED"' EXIT

run_node_list "$BACKUP" | sort > "$EXPECTED_CLEAN"
run_node_list "$EXTRACT_DIR" | sort > "$EXPECTED_PATCHED"

CLEAN_COUNT=$(wc -l < "$EXPECTED_CLEAN" | tr -d ' ')
PATCHED_COUNT=$(wc -l < "$EXPECTED_PATCHED" | tr -d ' ')

# --- Step 5: Structural verification ---
printf '\n\033[36m[5/6] Structural checks...\033[0m\n'

# Check index.html layer declaration
INDEX_FILE="$EXTRACT_DIR/webview/index.html"
if [[ -f "$INDEX_FILE" ]]; then
  if grep -q 'chatgpt-rtl, theme, base, components, utilities' "$INDEX_FILE"; then
    check "index.html layer declaration" "pass"
  else
    check "index.html layer declaration" "chatgpt-rtl not in layer order"
  fi
else
  check "index.html layer declaration" "webview/index.html not found"
fi

# Check CSS markers in all CSS files under webview/assets
CSS_PATCHED=0
CSS_TOTAL=0
if [[ -d "$EXTRACT_DIR/webview/assets" ]]; then
  while IFS= read -r -d '' cssfile; do
    CSS_TOTAL=$((CSS_TOTAL + 1))
    if grep -q 'ChatGPT Persian RTL desktop patch' "$cssfile" 2>/dev/null; then
      CSS_PATCHED=$((CSS_PATCHED + 1))
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" -name '*.css' -print0 2>/dev/null)
fi
if [[ "$CSS_TOTAL" -eq 0 ]]; then
  check "CSS files patched ($CSS_PATCHED/$CSS_TOTAL)" "no CSS files found under webview/assets"
elif [[ "$CSS_PATCHED" -eq "$CSS_TOTAL" ]]; then
  check "CSS files patched ($CSS_PATCHED/$CSS_TOTAL)" "pass"
else
  check "CSS files patched ($CSS_PATCHED/$CSS_TOTAL)" "$(( CSS_TOTAL - CSS_PATCHED )) CSS files missing patch marker"
fi

# Check JS runtime in candidate files only
JS_PATCHED=0
JS_TOTAL=0
if [[ -d "$EXTRACT_DIR/webview/assets" ]]; then
  while IFS= read -r -d '' jsfile; do
    JS_TOTAL=$((JS_TOTAL + 1))
    if grep -q 'ChatGPT Persian RTL desktop patch: runtime' "$jsfile" 2>/dev/null; then
      JS_PATCHED=$((JS_PATCHED + 1))
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" \
    -name '*.js' -not -name '*.map' -not -name '*.js.map' \
    \( \
      -name 'app-main-*' -o \
      -name 'chatgpt-conversation-page-*' -o \
      -name 'thread-user-message-*' -o \
      -name 'composer-*' -o \
      -name 'local-conversation-thread-*' -o \
      -name 'remote-conversation-page-*' -o \
      -name 'app-initial*chatgpt*' \
    \) -print0 2>/dev/null)
fi
if [[ "$JS_TOTAL" -eq 0 ]]; then
  check "JS runtime targets ($JS_TOTAL total, $JS_PATCHED patched)" "no JS runtime candidate files found"
elif [[ "$JS_PATCHED" -eq "$JS_TOTAL" ]]; then
  check "JS runtime targets ($JS_TOTAL total, $JS_PATCHED patched)" "pass"
else
  check "JS runtime targets ($JS_TOTAL total, $JS_PATCHED patched)" "$(( JS_TOTAL - JS_PATCHED )) targets missing runtime"
fi

# Check JS runtime was NOT injected into non-renderer bundles
BAD_INJECT=0
if [[ -d "$EXTRACT_DIR/.vite/build" ]]; then
  while IFS= read -r -d '' jsfile; do
    if grep -q 'ChatGPT Persian RTL desktop patch' "$jsfile" 2>/dev/null; then
      BAD_INJECT=1
      break
    fi
  done < <(find "$EXTRACT_DIR/.vite/build" -name '*.js' -print0 2>/dev/null)
fi
if [[ "$BAD_INJECT" -eq 0 ]]; then
  check "No runtime in .vite/build (main/preload)" "pass"
else
  check "No runtime in .vite/build (main/preload)" "runtime leaked into non-renderer bundle"
fi

# Check CSS content: no [class*="code"] selector (strip comments first)
BAD_SELECTOR=0
if [[ -d "$EXTRACT_DIR" ]]; then
  while IFS= read -r -d '' cssfile; do
    if perl -0777 -pe 's{/\*.*?\*/}{}gs' "$cssfile" 2>/dev/null | grep -q '\[class\*="code"\]' 2>/dev/null; then
      BAD_SELECTOR=1
      break
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" -name '*.css' -print0 2>/dev/null)
fi
if [[ "$BAD_SELECTOR" -eq 0 ]]; then
  check "No [class*=\"code\"] selector" "pass"
else
  check "No [class*=\"code\"] selector" "found forbidden selector"
fi

# Check CSS content: @layer chatgpt-rtl present
LAYER_PRESENT=0
if [[ -d "$EXTRACT_DIR/webview/assets" ]]; then
  while IFS= read -r -d '' cssfile; do
    if grep -q '@layer chatgpt-rtl' "$cssfile" 2>/dev/null; then
      LAYER_PRESENT=1
      break
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" -name '*.css' -print0 2>/dev/null)
fi
if [[ "$LAYER_PRESENT" -eq 1 ]]; then
  check "@layer chatgpt-rtl present in CSS" "pass"
else
  check "@layer chatgpt-rtl present in CSS" "layer not found"
fi

# Check CSS content: font overrides are unlayered (outside @layer)
FONT_OVERRIDE=0
if [[ -d "$EXTRACT_DIR/webview/assets" ]]; then
  while IFS= read -r -d '' cssfile; do
    if grep -q '\-\-font-sans:' "$cssfile" 2>/dev/null; then
      FONT_OVERRIDE=1
      break
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" -name '*.css' -print0 2>/dev/null)
fi
if [[ "$FONT_OVERRIDE" -eq 1 ]]; then
  check "--font-sans override present" "pass"
else
  check "--font-sans override present" "not found in any CSS"
fi

# Check JS runtime: document.head fallback
RUNTIME_FALLBACK=0
if [[ -d "$EXTRACT_DIR/webview/assets" ]]; then
  while IFS= read -r -d '' jsfile; do
    if grep -q 'document.head || document.documentElement' "$jsfile" 2>/dev/null; then
      RUNTIME_FALLBACK=1
      break
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" -name '*.js' -not -name '*.map' -print0 2>/dev/null)
fi
if [[ "$RUNTIME_FALLBACK" -eq 1 ]]; then
  check "Runtime: document.head fallback" "pass"
else
  check "Runtime: document.head fallback" "not found"
fi

# Check JS runtime: style ID for duplicate prevention
RUNTIME_STYLEID=0
if [[ -d "$EXTRACT_DIR/webview/assets" ]]; then
  while IFS= read -r -d '' jsfile; do
    if grep -q 'chatgpt-persian-rtl-desktop-style' "$jsfile" 2>/dev/null; then
      RUNTIME_STYLEID=1
      break
    fi
  done < <(find "$EXTRACT_DIR/webview/assets" -name '*.js' -not -name '*.map' -print0 2>/dev/null)
fi
if [[ "$RUNTIME_STYLEID" -eq 1 ]]; then
  check "Runtime: style ID guard" "pass"
else
  check "Runtime: style ID guard" "not found"
fi

# Check --list count
if [[ "$PATCHED_COUNT" -gt 0 ]]; then
  check "--list targets ($PATCHED_COUNT total, $CLEAN_COUNT clean)" "pass"
else
  check "--list targets" "patched --list returned 0 targets"
fi

# Check --list equivalence between asar and extracted dir
if diff -q "$EXPECTED_CLEAN" "$EXPECTED_PATCHED" >/dev/null 2>&1; then
  check "--list asar/dir equivalence" "pass"
else
  DIFF_LINES=$(diff "$EXPECTED_CLEAN" "$EXPECTED_PATCHED" | grep -c '^[<>]' || true)
  check "--list asar/dir equivalence" "differ in $DIFF_LINES lines"
fi

# --- Step 6: Codesign verification ---
printf '\n\033[36m[6/6] Codesign verification...\033[0m\n'
if codesign --verify --deep --strict --verbose=2 /Applications/ChatGPT.app 2>/dev/null; then
  check "codesign --verify" "pass"
else
  check "codesign --verify" "signature invalid (app may still work but shows unsigned warning)"
fi

# --- Summary ---
printf '\n%s\n' '─────────────────────────────────────'
printf '  \033[1mResults: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
printf '%s\n' '─────────────────────────────────────'
printf '\nTargets: %s (clean) → %s (patched)\n' "$CLEAN_COUNT" "$PATCHED_COUNT"
printf 'Extract dir: %s\n\n' "$EXTRACT_DIR"

if [[ "$FAIL" -gt 0 ]]; then
  printf '\033[33mSome checks failed. Rollback:\033[0m\n'
  printf '  sudo cp "%s" "%s"\n' "$BACKUP" "$ASAR"
  printf '  sudo node "%s" --platform=macos --restore\n\n' "$PATCHER"
  exit 1
fi

printf '\033[32mAll structural checks passed!\033[0m\n\n'
printf 'Next: open ChatGPT, paste some Persian text, and verify:\n'
printf '  • Persian user/assistant messages render RTL with Vazirmatn\n'
printf '  • English messages remain LTR\n'
printf '  • Mixed text direction is correct\n'
printf '  • Composer (textarea) shows Persian RTL\n'
printf '  • Code blocks stay LTR with monospace font\n'
printf '  • Buttons/icons/SVGs are not affected\n'
printf '  • Tables have normal layout (not forced LTR)\n'
