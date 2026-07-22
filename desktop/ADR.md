# ADR: Electron Runtime RTL Patching Architecture

## Status
Accepted

## Context
ChatGPT Desktop / Codex Electron can be controlled at runtime through loopback CDP when launched against the real user profile. That makes it possible to apply Persian RTL behavior without modifying the official application bundle, `app.asar`, Sparkle artifacts, or code signing state.

The working solution needs to:

1. Launch the real app with a dynamic remote-debugging port
2. Preserve the user’s normal login, chats, preferences, and app state
3. Attach to live `page`, `webview`, and `iframe` targets
4. Re-apply runtime and stylesheet injection across navigation, reload, and recreated targets
5. Load Vazirmatn from the repository’s real font files and verify that the font actually renders

## Decision

### 1. Runtime over bundle patching
The live RTL solution is implemented as an external launcher and runtime injector.

- Quit existing `com.openai.codex` processes
- Launch `/Applications/ChatGPT.app` with a dynamically selected loopback debug port
- Do not pass a temporary `--user-data-dir`
- Connect to the browser websocket endpoint and auto-attach to relevant live targets

This preserves the official bundle and keeps the user’s real session intact.

### 2. Persistent injection
The runtime injector is idempotent and re-applies itself when the renderer changes.

- `Page.enable`
- `Runtime.enable`
- `Page.addScriptToEvaluateOnNewDocument`
- Immediate evaluation in the already-loaded document
- Reapply after `Page.frameNavigated`, `Page.loadEventFired`, execution-context creation, and target recreation

The stylesheet is treated as a live asset:

- Create `<style id="chatgpt-rtl-style">`
- Verify `style.isConnected === true`
- Verify `style.sheet !== null`
- Restore it immediately if removed
- Use `document.adoptedStyleSheets` as a fallback where supported

### 3. Font strategy
Vazirmatn is sourced from the repository’s official font package.

- Prefer `desktop/shared/fonts/webfonts/Vazirmatn[wght].woff2` when it validates
- Fall back to the real static WOFF2 files only if the variable font fails validation
- Validate WOFF2 signature, metadata, SHA-256, file size, `document.fonts.load()`, `document.fonts.check()`, and canvas render width

The official source page is recorded in the docs:

- `https://rastikerdar.github.io/vazirmatn/fa`

### 4. Verification
Success is runtime-first and visible in the real application.

- The app opens with the normal profile
- At least one live target is attached
- The runtime stylesheet remains active
- Representative font weights load successfully
- Composer and message surfaces show Vazirmatn
- Code and technical content remain monospace and LTR

## Consequences

### Benefits
- No app bundle modifications
- User state is preserved
- Injection survives reloads and target recreation
- Font loading is validated against the live renderer

### Drawbacks
- The solution depends on remote debugging availability
- Selector drift can require runtime selector updates
- Final acceptance still benefits from human visual confirmation

### Alternatives Considered
1. Asar patching: rejected for the live RTL track because the success criterion is visible RTL in the real app without changing the official bundle
2. Accessibility-only styling: rejected because it can expose content but cannot reliably control the renderer styling surface
3. User stylesheet: rejected because it is not durable across recreated renderer targets
4. Browser-extension-only approach: rejected because the desktop Electron target has its own target lifecycle and app shell

## Compliance

- No bundle tampering
- No secrets or credentials are stored
- No hidden fallback: font and attachment failures are surfaced as structured diagnostics
- The runtime is idempotent and safe to re-run
