# ADR: Electron Asar RTL Patching Architecture

## Status
Accepted

## Context
ChatGPT Desktop (Electron) uses a single `app.asar` archive containing all renderer/webview bundles. To support Persian RTL layout, we need to inject:

1. **CSS**: Vazirmatn font + RTL direction rules with proper cascade layer ordering
2. **JS**: DOM runtime to detect and mark RTL/LTR content blocks
3. **Layer order**: Modify `index.html` to declare `@layer chatgpt-rtl` first for !important priority

The patcher must:
- Be idempotent (no double injection)
- Preserve source maps
- Only target renderer/webview bundles (not main/preload/worker)
- Work across ChatGPT versions and bundle filename changes
- Pass strict verification

## Decision
### 1. Asar Extraction Flow
```
app.asar → extract → inject → repack → app.asar
```
- Use `@electron/asar` for extraction/repacking
- Handle both `.asar` files and extracted directories
- Clean temp dir before/after

### 2. Target Discovery
- **CSS**: All `.css` files under `webview/assets/`
- **JS**: Renderer bundles matching `webview/assets/(app-main|chatgpt-conversation-page|thread-user-message|composer-|local-conversation-thread|remote-conversation-page|app-initial.*chatgpt).*\.js$`
- **Exclude**: `.vite/build/`, `node_modules/`, `.map` files

### 3. Injection Strategy
- **CSS**: Append after original content, before source map
- **JS**: Insert before source map comment, or append if no source map
- **Layer order**: Replace `@layer theme, base, components, utilities;` with `@layer chatgpt-rtl, theme, base, components, utilities;` in `webview/index.html`

### 4. Idempotency
- **CSS/JS**: Marker guard `/* ChatGPT Persian RTL desktop patch */`
- **Layer**: Check for patched declaration before replacing
- **Runtime**: `window[PATCH_ID]` guard

### 5. Verification
- **Structural**: 44 automated tests covering injection, idempotency, round-trip
- **Real-app**: Bash verifier with comment-aware checks
- **Safety**: Codesign verification, write permission checks

## Consequences
### Benefits
- ✅ **Robust**: Regex-based layer injection handles whitespace variations
- ✅ **Safe**: No runtime in main/preload/worker bundles
- ✅ **Verifiable**: Comprehensive test suite + real-app verifier
- ✅ **Maintainable**: Clear separation of patcher/verifier/tests

### Drawbacks
- ⚠️ **Asar limitations**: `extractAll` fails on `.bak` files without `.asar.unpacked` companion
- ⚠️ **Electron updates**: May require bundle filename pattern updates
- ⚠️ **Codesign**: macOS ad-hoc signing may trigger unsigned app warnings

### Alternatives Considered
1. **Preload script injection**: Rejected - requires main process access
2. **Webpack plugin**: Rejected - requires ChatGPT source code access
3. **User stylesheet**: Rejected - insufficient cascade control
4. **Browser extension**: Rejected - no access to Electron `document` before load

## Compliance
- **Security**: No secrets/logging, no destructive operations
- **Privacy**: No telemetry, no network access
- **Reliability**: Idempotent, rollback on failure, comprehensive tests
