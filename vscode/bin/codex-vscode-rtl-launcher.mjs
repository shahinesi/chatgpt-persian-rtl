#!/usr/bin/env node
/**
 * VS Code adapter for the ChatGPT Persian RTL engine.
 *
 * Modes:
 *   (none)   — foreground: stays attached to terminal
 *   --bg     — background: writes LaunchAgent plist, bootstraps via launchctl, exits
 *   --daemon — internal: launchd-managed daemon that owns Electron lifecycle
 *
 * Reuses: ../desktop/shared/rtl-runtime.js, rtl-patch.css, fonts/
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  STATE_DIR, STATE_FILE, LOG_FILE, PATCH_ID, PROJECT_ROOT, DESKTOP_SHARED,
  RUNTIME_PATH, CSS_PATH, WEBFONT_ROOT, RUNTIME_BUILD_MARKER,
  VSCODE_CANDIDATES, SERVICE_LABEL, PLIST_PATH,
  log, sleep, saveState, loadState, clearState,
  waitForCDP, checkCDP, checkPid,
  generatePlist, writePlist, removePlist,
  launchctlIsLoaded, launchctlBootstrap, launchctlKickstart,
  launchctlRemoveStale, launchctlPrint
} from './vscode-rtl-state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER_SCRIPT = fileURLToPath(import.meta.url);

// ── Utilities ───────────────────────────────────────────────────
function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Failed to allocate loopback port')));
        return;
      }
      const { port } = addr;
      server.close(() => resolve(port));
    });
  });
}

function findVSCodeApp() {
  const override = process.env.CODEX_RTL_VSCODE_APP;
  if (override) {
    if (!existsSync(override)) throw new Error(`CODEX_RTL_VSCODE_APP path does not exist: ${override}`);
    return override;
  }
  for (const candidate of VSCODE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No VS Code application found in /Applications');
}

function getVSCodeExecutable(appPath) {
  const electronPath = path.join(appPath, 'Contents', 'MacOS', 'Electron');
  if (!existsSync(electronPath)) {
    throw new Error(`VS Code Electron binary not found at: ${electronPath}`);
  }
  return electronPath;
}


export function getProfileMode(args = []) {
  return args.includes('--isolated') ? 'isolated' : 'normal';
}

export function buildVSCodeLaunchArgs(port, workspace = null, profileMode = 'normal') {
  const launchArgs = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1'
  ];

  if (profileMode === 'isolated') {
    launchArgs.push(`--user-data-dir=${STATE_DIR}`);
    launchArgs.push('--extensions-dir', path.join(STATE_DIR, 'extensions'));
  }

  if (workspace) launchArgs.push(workspace);
  return launchArgs;
}

export function parseMainVSCodePids(psOutput, executablePath) {
  const exactPrefix = `${executablePath} `;
  return String(psOutput || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) return null;
      const pid = Number(match[1]);
      const command = match[2];
      if (command !== executablePath && !command.startsWith(exactPrefix)) return null;
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    })
    .filter(Boolean);
}

function findRunningMainVSCodePids(executablePath) {
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Unable to inspect running VS Code processes: ${(result.stderr || '').trim()}`);
  }
  return parseMainVSCodePids(result.stdout, executablePath);
}

function liveOwnedElectronPid(executablePath) {
  const state = loadState();
  if (!state || state.executablePath !== executablePath || !state.electronPid) return null;
  const adapterAlive = checkPid(state.adapterPid).alive;
  const electronAlive = checkPid(state.electronPid).alive;
  return adapterAlive && electronAlive ? Number(state.electronPid) : null;
}

export function findUnrelatedMainVSCodePids(allPids, ownedElectronPid = null) {
  return allPids.filter((pid) => Number(pid) !== Number(ownedElectronPid));
}

function assertNormalVSCodeAvailable(executablePath) {
  const runningPids = findRunningMainVSCodePids(executablePath);
  const ownedPid = liveOwnedElectronPid(executablePath);
  const unrelatedPids = findUnrelatedMainVSCodePids(runningPids, ownedPid);
  if (unrelatedPids.length > 0) {
    throw new Error(
      'Normal VS Code is already running.\n' +
      'Quit all VS Code windows completely, then run:\n' +
      'npm --prefix vscode run rtl:launch:bg'
    );
  }
}

// ── Font loading ────────────────────────────────────────────────
function readValidatedFontAsset(fileName) {
  const fontPath = path.join(WEBFONT_ROOT, fileName);
  if (!existsSync(fontPath)) throw new Error(`Font file missing: ${fontPath}`);
  const stat = statSync(fontPath);
  if (stat.size <= 0) throw new Error(`Font file empty: ${fontPath}`);
  const buffer = readFileSync(fontPath);
  if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== 'wOF2') {
    throw new Error(`Not a valid WOFF2: ${fontPath}`);
  }
  return {
    fileName, fontPath, size: stat.size,
    sha256: sha256Hex(buffer),
    base64: buffer.toString('base64'),
    dataUrl: `data:font/woff2;base64,${buffer.toString('base64')}`
  };
}

function loadFontAssets() {
  const variablePath = path.join(WEBFONT_ROOT, 'Vazirmatn[wght].woff2');
  if (existsSync(variablePath)) {
    return { variable: readValidatedFontAsset('Vazirmatn[wght].woff2'), static: null };
  }
  const staticWeights = [100, 400, 500, 600, 700, 900];
  const staticFiles = {
    100: 'Vazirmatn-Thin.woff2', 400: 'Vazirmatn-Regular.woff2',
    500: 'Vazirmatn-Medium.woff2', 600: 'Vazirmatn-SemiBold.woff2',
    700: 'Vazirmatn-Bold.woff2', 900: 'Vazirmatn-Black.woff2'
  };
  const staticAssets = {};
  for (const w of staticWeights) {
    staticAssets[w] = { ...readValidatedFontAsset(staticFiles[w]), weight: w };
  }
  return { variable: null, static: staticAssets };
}

function buildFontFaceBlocks(fontAssets) {
  if (fontAssets.variable) {
    return `@font-face{font-family:"Vazirmatn";src:url("${fontAssets.variable.dataUrl}") format("woff2");font-style:normal;font-weight:100 900;font-display:swap;}`;
  }
  return Object.values(fontAssets.static).map(a =>
    `@font-face{font-family:"Vazirmatn";src:url("${a.dataUrl}") format("woff2");font-style:normal;font-weight:${a.weight};font-display:swap;}`
  ).join('\n');
}

function buildVSCodeCompatibilitySource(fontAssets) {
  const fontFacePayload = fontAssets.variable
    ? [{ family: 'Vazirmatn', base64: fontAssets.variable.base64, weight: '100 900', style: 'normal' }]
    : Object.values(fontAssets.static).map((asset) => ({
        family: 'Vazirmatn',
        base64: asset.base64,
        weight: String(asset.weight),
        style: 'normal'
      }));
  const compatibilityCss = `${buildFontFaceBlocks(fontAssets)}
[data-cgpt-vscode-text], [data-cgpt-vscode-composer] {
  --font-sans: "Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif !important;
  --font-sans-default: "Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif !important;
  font-family: "Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif !important;
  unicode-bidi: plaintext !important;
}
[data-cgpt-vscode-dir="rtl"] { direction: rtl !important; text-align: right !important; }
[data-cgpt-vscode-dir="ltr"] { direction: ltr !important; text-align: left !important; }
pre, code, kbd, samp, pre *, code * {
  direction: ltr !important;
  text-align: left !important;
  unicode-bidi: isolate !important;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace !important;
}`;

  return `;(() => {
    'use strict';

    const MARKER = ${JSON.stringify(VSCODE_COMPAT_MARKER)};
    const STYLE_ID = ${JSON.stringify(VSCODE_COMPAT_STYLE_ID)};
    const CSS = ${JSON.stringify(compatibilityCss)};
    const FONT_FACES = ${JSON.stringify(fontFacePayload)};
    const FONT_STACK = '"Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif';
    const RTL_CHAR = /[\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF]/u;
    const LATIN_CHAR = /[A-Za-z]/u;
    const TECHNICAL_SELECTOR = 'pre,code,kbd,samp,table,math,.katex,.MathJax,[data-math],[data-language]';
    const INTERACTIVE_SELECTOR = 'button,[role="button"],[role="tab"],[role="toolbar"],[role="tablist"],select,option,svg,[aria-hidden="true"]';
    const SEMANTIC_TEXT_SELECTOR = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,figcaption,[role="listitem"]';
    const EDITOR_SELECTOR = 'textarea,[contenteditable="true"],[role="textbox"]';

    const previous = window[MARKER];
    if (previous && typeof previous.refresh === 'function') {
      previous.refresh('reinjected');
      return;
    }

    let observer = null;
    let scheduled = false;
    let composer = null;
    let fontReady = false;
    let fontError = null;
    let fontLoadPromise = null;
    let loadedFontFaces = [];
    const boundEditors = new WeakSet();
    const stats = {
      refreshCount: 0,
      managedCount: 0,
      rtlCount: 0,
      ltrCount: 0,
      composerFound: false,
      lastReason: 'init'
    };

    function base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes.buffer;
    }

    function ensureFontLoaded() {
      if (fontReady) return Promise.resolve(true);
      if (fontLoadPromise) return fontLoadPromise;
      fontLoadPromise = (async () => {
        const faces = [];
        for (const definition of FONT_FACES) {
          const face = new FontFace(
            definition.family,
            base64ToArrayBuffer(definition.base64),
            { style: definition.style || 'normal', weight: definition.weight || '400' }
          );
          document.fonts.add(face);
          await face.load();
          faces.push(face);
        }
        loadedFontFaces = faces;
        fontReady = faces.length > 0 && faces.every((face) => face.status === 'loaded');
        fontError = null;
        return fontReady;
      })().catch((error) => {
        fontReady = false;
        fontError = String(error?.message || error);
        return false;
      });
      return fontLoadPromise;
    }

    function injectCompatibilityStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        style.setAttribute('data-chatgpt-persian-rtl', 'vscode-compat');
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      }
      ensureFontLoaded().then((loaded) => {
        if (loaded) schedule('font-loaded');
      });
      return style;
    }

    function visible(element) {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const cs = getComputedStyle(element);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }

    function isExcluded(element) {
      if (!(element instanceof Element)) return true;
      if (element.matches(TECHNICAL_SELECTOR) || element.closest(TECHNICAL_SELECTOR)) return true;
      if (element.matches(INTERACTIVE_SELECTOR) || element.closest(INTERACTIVE_SELECTOR)) return true;
      if (element.closest('header,nav,[role="navigation"]')) return true;
      return false;
    }

    function normalizedText(element) {
      return String(element?.textContent || '').replace(/\\s+/g, ' ').trim();
    }

    function hasStrongText(text) {
      return RTL_CHAR.test(text) || LATIN_CHAR.test(text);
    }

    function detectDirection(text, emptyDirection = 'ltr') {
      const value = String(text || '').trim();
      if (!value) return emptyDirection;
      let rtl = 0;
      let latin = 0;
      let first = null;
      for (const char of value) {
        if (RTL_CHAR.test(char)) {
          rtl += 1;
          if (!first) first = 'rtl';
        } else if (LATIN_CHAR.test(char)) {
          latin += 1;
          if (!first) first = 'ltr';
        }
      }
      if (!rtl && !latin) return emptyDirection;
      if (!rtl) return 'ltr';
      if (!latin) return 'rtl';
      return first || emptyDirection;
    }

    function setImportant(element, property, value) {
      element.style.setProperty(property, value, 'important');
    }

    function applyFont(element) {
      element.setAttribute('data-cgpt-vscode-text', '');
      setImportant(element, '--font-sans', FONT_STACK);
      setImportant(element, '--font-sans-default', FONT_STACK);
      setImportant(element, 'font-family', FONT_STACK);
      setImportant(element, 'unicode-bidi', 'plaintext');
    }

    function applyDirection(element, direction) {
      element.setAttribute('data-cgpt-vscode-dir', direction);
      element.setAttribute('data-cgpt-flow-dir', direction);
      element.setAttribute('data-cgpt-rtl-dir', direction);
      setImportant(element, 'direction', direction);
      setImportant(element, 'text-align', direction === 'rtl' ? 'right' : 'left');
      setImportant(element, 'unicode-bidi', 'plaintext');
    }

    function hasVisibleBlockChild(element) {
      return Array.from(element.children).some((child) => {
        if (!(child instanceof HTMLElement) || !visible(child)) return false;
        const display = getComputedStyle(child).display;
        return /^(block|flex|grid|list-item|table)/.test(display) && hasStrongText(normalizedText(child));
      });
    }

    function isGenericLeafTextBlock(element) {
      if (!(element instanceof HTMLElement) || !visible(element) || isExcluded(element)) return false;
      const text = normalizedText(element);
      if (!text || text.length > 12000 || !hasStrongText(text)) return false;
      if (element.matches(SEMANTIC_TEXT_SELECTOR)) return true;
      if (!element.matches('div,span')) return false;
      if (hasVisibleBlockChild(element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.height > 260) return false;
      return true;
    }

    function applyTextBlock(element) {
      if (!isGenericLeafTextBlock(element)) return false;
      const text = normalizedText(element);
      const direction = detectDirection(text, 'ltr');
      applyFont(element);
      applyDirection(element, direction);
      if (element.matches('li')) {
        const list = element.closest('ol,ul');
        if (list) {
          applyFont(list);
          applyDirection(list, direction);
        }
      }
      return true;
    }

    function editorText(element) {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element.value || '';
      return element.textContent || '';
    }

    function findComposer() {
      const candidates = Array.from(document.querySelectorAll(EDITOR_SELECTOR))
        .filter((element) => element instanceof HTMLElement && visible(element) && !element.closest('pre,code'));
      let best = null;
      let bestScore = -Infinity;
      for (const element of candidates) {
        const rect = element.getBoundingClientRect();
        const placeholder = String(element.getAttribute('placeholder') || element.getAttribute('aria-label') || '').toLowerCase();
        let score = rect.width * rect.height;
        score += rect.top * 10;
        if (element instanceof HTMLTextAreaElement) score += 100000;
        if (placeholder.includes('ask') || placeholder.includes('follow-up') || placeholder.includes('message')) score += 200000;
        if (score > bestScore) {
          best = element;
          bestScore = score;
        }
      }
      return best;
    }

    function applyComposer() {
      if (!composer || !document.contains(composer) || !visible(composer)) composer = findComposer();
      if (!composer) return false;
      const direction = detectDirection(editorText(composer), 'rtl');
      composer.setAttribute('data-cgpt-vscode-composer', '');
      composer.setAttribute('data-cgpt-rtl-managed', 'composer-text');
      applyFont(composer);
      applyDirection(composer, direction);
      const wrapper = composer.parentElement;
      if (wrapper instanceof HTMLElement) {
        setImportant(wrapper, '--font-sans', FONT_STACK);
        setImportant(wrapper, '--font-sans-default', FONT_STACK);
      }
      if (!boundEditors.has(composer)) {
        const update = () => schedule('composer-input');
        composer.addEventListener('input', update, { passive: true });
        composer.addEventListener('compositionend', update, { passive: true });
        boundEditors.add(composer);
      }
      return true;
    }

    function refresh(reason = 'manual') {
      injectCompatibilityStyle();
      stats.refreshCount += 1;
      stats.lastReason = reason;
      let managed = 0;
      let rtl = 0;
      let ltr = 0;
      const candidates = new Set(document.querySelectorAll(SEMANTIC_TEXT_SELECTOR + ', div, span'));
      for (const element of candidates) {
        if (!applyTextBlock(element)) continue;
        managed += 1;
        if (element.getAttribute('data-cgpt-vscode-dir') === 'rtl') rtl += 1;
        else ltr += 1;
      }
      stats.managedCount = managed;
      stats.rtlCount = rtl;
      stats.ltrCount = ltr;
      stats.composerFound = applyComposer();
    }

    function schedule(reason = 'mutation') {
      stats.lastReason = reason;
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refresh(reason);
      });
    }

    function diagnostics() {
      const managed = Array.from(document.querySelectorAll('[data-cgpt-vscode-text], [data-cgpt-vscode-composer]'));
      const fontFamilyApplied = managed.some((element) => /Vazirmatn/i.test(getComputedStyle(element).fontFamily || ''));
      const fontApplied = fontReady && fontFamilyApplied;
      const rtlApplied = managed.some((element) => element.getAttribute('data-cgpt-vscode-dir') === 'rtl' && getComputedStyle(element).direction === 'rtl');
      const ltrApplied = managed.some((element) => element.getAttribute('data-cgpt-vscode-dir') === 'ltr' && getComputedStyle(element).direction === 'ltr');
      const activeComposer = composer && document.contains(composer) ? composer : findComposer();
      return {
        installed: true,
        styleConnected: Boolean(document.getElementById(STYLE_ID)?.isConnected),
        managedCount: managed.length,
        rtlCount: stats.rtlCount,
        ltrCount: stats.ltrCount,
        composerFound: Boolean(activeComposer),
        composerDirection: activeComposer ? getComputedStyle(activeComposer).direction : null,
        composerFontFamily: activeComposer ? getComputedStyle(activeComposer).fontFamily : null,
        fontReady,
        fontFaceCount: loadedFontFaces.length,
        fontFaceStatuses: loadedFontFaces.map((face) => face.status),
        fontCheck: Boolean(document.fonts?.check('400 16px "Vazirmatn"')),
        fontError,
        fontApplied,
        rtlApplied,
        ltrApplied,
        visualApplied: fontApplied && (rtlApplied || ltrApplied),
        refreshCount: stats.refreshCount,
        lastReason: stats.lastReason
      };
    }

    function start() {
      injectCompatibilityStyle();
      refresh('start');
      if (!observer && document.body) {
        observer = new MutationObserver(() => schedule('mutation'));
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    }

    window[MARKER] = { refresh, diagnostics, ensureFontLoaded, version: 2 };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  })();`;
}

function buildInjectionSource(fontAssets, options) {
  const { buildMarker, runtimeSourceHash, cssSourceHash, diagnosticMode } = options;
  const css = readFileSync(CSS_PATH, 'utf8');
  const inlinedCss = css.replace('__FONT_FACE_BLOCKS__', buildFontFaceBlocks(fontAssets));
  const runtime = readFileSync(RUNTIME_PATH, 'utf8')
    .replace('__CHATGPT_RTL_BUILD__', JSON.stringify(buildMarker))
    .replace('__CHATGPT_RTL_RUNTIME_SHA256__', JSON.stringify(runtimeSourceHash))
    .replace('__CHATGPT_RTL_CSS_SHA256__', JSON.stringify(cssSourceHash))
    .replace('__CHATGPT_RTL_DIAGNOSTIC_MODE__', String(!!diagnosticMode))
    .replace('__CHATGPT_PERSIAN_RTL_CSS__', JSON.stringify(inlinedCss));
  return `${runtime}\n${buildVSCodeCompatibilitySource(fontAssets)}`;
}

// ── CDP connection ──────────────────────────────────────────────
async function cdpConnect(browserWsUrl) {
  const ws = new WebSocket(browserWsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  const eventHandlers = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      const handlers = eventHandlers.get(msg.method);
      if (handlers) for (const h of handlers) h(msg.params || {}, msg);
    }
  };
  ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('closed')); pending.clear(); };
  function send(method, params = {}, sessionId = null) {
    const id = nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    ws.send(JSON.stringify(payload));
    return new Promise((r, j) => pending.set(id, { resolve: r, reject: j }));
  }
  function on(method, handler) {
    if (!eventHandlers.has(method)) eventHandlers.set(method, new Set());
    eventHandlers.get(method).add(handler);
  }
  return { ws, send, on };
}

async function evaluate(send, sessionId, expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(`Eval error: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

// ── Codex Webview identification ────────────────────────────────
const CODEx_WEBVIEW_TARGET_TYPES = new Set(['iframe', 'page']);
const CODEx_WEBVIEW_STYLE_ID = 'chatgpt-rtl-style';
const VSCODE_COMPAT_MARKER = '__chatgptPersianRtlVscodeCompatV1__';
const VSCODE_COMPAT_STYLE_ID = 'chatgpt-persian-rtl-vscode-compat-style';

function normalizeTargetRecord(targetInfo = {}) {
  const targetId = String(targetInfo.targetId || targetInfo.id || '');
  return {
    id: targetId,
    targetId,
    type: String(targetInfo.type || ''),
    url: String(targetInfo.url || ''),
    title: String(targetInfo.title || ''),
    parentId: targetInfo.parentId || null,
    webSocketDebuggerUrl: targetInfo.webSocketDebuggerUrl || null,
    source: targetInfo.source || null
  };
}

export async function fetchJsonListTargets(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload) ? payload.map(normalizeTargetRecord) : [];
  } catch {
    return [];
  }
}

export function buildJsonListTargetMap(targets = []) {
  const map = new Map();
  for (const target of targets) {
    const normalized = normalizeTargetRecord(target);
    if (normalized.targetId) map.set(normalized.targetId, normalized);
  }
  return map;
}

export function mergeTargetMetadata(targetInfo = {}, jsonTarget = null) {
  const cdp = normalizeTargetRecord(targetInfo);
  const json = jsonTarget ? normalizeTargetRecord(jsonTarget) : null;
  const url = cdp.url || json?.url || '';
  const title = cdp.title || json?.title || '';
  const parentId = cdp.parentId || json?.parentId || null;
  const webSocketDebuggerUrl = cdp.webSocketDebuggerUrl || json?.webSocketDebuggerUrl || null;
  return {
    ...cdp,
    cdpUrl: cdp.url,
    jsonListUrl: json?.url || '',
    url,
    title,
    parentId,
    webSocketDebuggerUrl
  };
}

function isWorkbenchUrl(url) {
  const normalized = String(url || '');
  return normalized.startsWith('vscode-file:') && normalized.includes('/workbench/workbench.html');
}

export function sanitizePersistedState(state, liveTargetsById = new Map()) {
  if (!state) return null;
  const next = { ...state };
  let changed = false;

  const validatedTarget = state.validatedTarget || null;
  const runtime = state.runtime || null;
  const validatedId = validatedTarget?.id || validatedTarget?.targetId || null;
  const validatedUrl = String(validatedTarget?.url || '');
  const targetMissing = validatedId ? !liveTargetsById.has(validatedId) : false;
  const invalidValidatedTarget = Boolean(validatedTarget) && (
    validatedTarget.type !== 'iframe' ||
    !validatedUrl.startsWith('vscode-webview:') ||
    isWorkbenchUrl(validatedUrl) ||
    targetMissing
  );
  const invalidRuntime = Boolean(runtime) && (!runtime.installed || !runtime.styleConnected || runtime.visualApplied !== true);

  if (invalidValidatedTarget) {
    next.validatedTarget = null;
    changed = true;
  }
  if (invalidRuntime) {
    next.runtime = null;
    changed = true;
  }
  return changed ? next : state;
}

export function formatCodexCandidateLog(candidate) {
  const accepted = candidate.accepted ? 'true' : 'false';
  const reason = candidate.reason || 'null';
  const cdpUrl = candidate.cdpUrl || '';
  const jsonListUrl = candidate.jsonListUrl || '';
  const probedHref = candidate.probedHref || '';
  return `Candidate target: id=${candidate.targetId} type=${candidate.type} cdpUrl=${cdpUrl} jsonListUrl=${jsonListUrl} probedHref=${probedHref} accepted=${accepted} reason=${reason}`;
}

function buildCandidateState(targetInfo, jsonTarget = null) {
  return mergeTargetMetadata(targetInfo, jsonTarget);
}

async function probeTargetHref(send, targetId, timeoutMs = 5000, intervalMs = 250) {
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  log(`Attached target session: targetId=${targetId} sessionId=${sessionId}`);
  await send('Runtime.enable', {}, sessionId);
  const probeExpr = `(() => JSON.stringify({
    href: location.href,
    readyState: document.readyState,
    hasDocumentElement: Boolean(document.documentElement),
    hasBody: Boolean(document.body),
    title: document.title,
    textareaCount: document.querySelectorAll('textarea').length,
    contenteditableCount: document.querySelectorAll('[contenteditable="true"]').length,
    runtimeMarker: Boolean(window[${JSON.stringify(PATCH_ID)}]),
    styleConnected: Boolean(document.getElementById(${JSON.stringify(CODEx_WEBVIEW_STYLE_ID)})?.isConnected)
  }))()`;
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  while (Date.now() <= deadline) {
    const result = await evaluate(send, sessionId, probeExpr);
    lastProbe = JSON.parse(result);
    if (lastProbe?.hasDocumentElement && lastProbe?.hasBody) break;
    await sleep(intervalMs);
  }
  return { sessionId, probe: lastProbe };
}

export async function resolveCodexTargetCandidate(send, targetInfo, jsonTarget = null, options = {}) {
  const merged = buildCandidateState(targetInfo, jsonTarget);
  const type = merged.type;
  const cdpUrl = merged.cdpUrl || '';
  const jsonListUrl = merged.jsonListUrl || '';
  const shouldProbe = type === 'iframe' && !cdpUrl && !jsonListUrl;
  let probedHref = '';
  let probe = null;
  let sessionId = null;
  let verdict = describeCodexWebviewTarget({ type, url: merged.url, targetId: merged.targetId });

  if (!verdict.accepted && shouldProbe) {
    const probeResult = await probeTargetHref(send, merged.targetId, options.timeoutMs || 5000, options.intervalMs || 250);
    sessionId = probeResult.sessionId;
    probe = probeResult.probe;
    probedHref = probe?.href || '';
    if (probedHref) {
      verdict = describeCodexWebviewTarget({ type, url: probedHref, targetId: merged.targetId });
      merged.url = probedHref;
    }
    if (!verdict.accepted && !probedHref) {
      verdict = { ...verdict, reason: 'invalid-url' };
    }
  }

  if (verdict.accepted) {
    return {
      ...merged,
      accepted: true,
      reason: null,
      probedHref,
      sessionId,
      probe,
      verdict
    };
  }

  return {
    ...merged,
    accepted: false,
    reason: verdict.reason || 'invalid-url',
    probedHref,
    sessionId,
    probe,
    verdict
  };
}

export function describeCodexWebviewTarget(targetInfo) {
  const type = String(targetInfo?.type || '');
  const url = String(targetInfo?.url || '');
  const targetId = String(targetInfo?.targetId || targetInfo?.id || '');
  let protocol = '';
  let extensionId = null;
  let purpose = null;
  let pathname = '';

  if (!CODEx_WEBVIEW_TARGET_TYPES.has(type)) {
    return { accepted: false, reason: 'unsupported-target-type', targetId, type, url, protocol, extensionId, purpose, pathname };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { accepted: false, reason: 'invalid-url', targetId, type, url, protocol, extensionId, purpose, pathname };
  }

  protocol = parsed.protocol;
  pathname = parsed.pathname || '';
  extensionId = parsed.searchParams.get('extensionId');
  purpose = parsed.searchParams.get('purpose');

  if (protocol !== 'vscode-webview:') {
    return { accepted: false, reason: 'not-vscode-webview', targetId, type, url, protocol, extensionId, purpose, pathname };
  }
  if (!pathname.endsWith('/index.html')) {
    return { accepted: false, reason: 'not-webview-index-html', targetId, type, url, protocol, extensionId, purpose, pathname };
  }
  if (extensionId !== 'openai.chatgpt') {
    return { accepted: false, reason: 'extensionId-mismatch', targetId, type, url, protocol, extensionId, purpose, pathname };
  }
  if (purpose !== 'webviewView') {
    return { accepted: false, reason: 'purpose-mismatch', targetId, type, url, protocol, extensionId, purpose, pathname };
  }

  return { accepted: true, reason: null, targetId, type, url, protocol, extensionId, purpose, pathname };
}

export function isCodexWebviewTarget(targetInfo) {
  return describeCodexWebviewTarget(targetInfo).accepted;
}

export function createCodexTargetTracker() {
  const injectedTargetIds = new Set();
  const rejectedTargetIds = new Set();
  const pendingTargetIds = new Set();
  const processingTargetIds = new Set();

  return {
    injectedTargetIds,
    rejectedTargetIds,
    pendingTargetIds,
    processingTargetIds,
    start(targetId) {
      if (injectedTargetIds.has(targetId) || rejectedTargetIds.has(targetId) || processingTargetIds.has(targetId)) {
        return false;
      }
      processingTargetIds.add(targetId);
      return true;
    },
    markInjected(targetId) {
      injectedTargetIds.add(targetId);
      pendingTargetIds.delete(targetId);
      processingTargetIds.delete(targetId);
    },
    markPending(targetId) {
      pendingTargetIds.add(targetId);
      processingTargetIds.delete(targetId);
    },
    markRejected(targetId) {
      rejectedTargetIds.add(targetId);
      pendingTargetIds.delete(targetId);
      processingTargetIds.delete(targetId);
    },
    forget(targetId) {
      injectedTargetIds.delete(targetId);
      rejectedTargetIds.delete(targetId);
      pendingTargetIds.delete(targetId);
      processingTargetIds.delete(targetId);
    }
  };
}

function waitForWebviewReadyProbe(send, sessionId) {
  const checkExpr = `(() => JSON.stringify({
    href: location.href,
    readyState: document.readyState,
    hasDocumentElement: Boolean(document.documentElement),
    hasBody: Boolean(document.body),
    title: document.title,
    textareaCount: document.querySelectorAll('textarea').length,
    contenteditableCount: document.querySelectorAll('[contenteditable="true"]').length,
    runtimeMarker: Boolean(window[${JSON.stringify(PATCH_ID)}]),
    styleConnected: Boolean(document.getElementById(${JSON.stringify(CODEx_WEBVIEW_STYLE_ID)})?.isConnected)
  }))()`;
  return evaluate(send, sessionId, checkExpr).then((result) => JSON.parse(result));
}

async function waitForWebviewReady(send, sessionId, timeoutMs = 5000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastProbe = null;
  while (Date.now() <= deadline) {
    lastProbe = await waitForWebviewReadyProbe(send, sessionId);
    if (lastProbe?.hasDocumentElement && lastProbe?.hasBody) return lastProbe;
    await sleep(intervalMs);
  }
  return lastProbe;
}

const VSCODE_INJECTION_WORLD = 'chatgpt-persian-rtl-vscode';

function flattenFrameTree(frameTree, output = []) {
  if (!frameTree?.frame) return output;
  output.push(frameTree.frame);
  for (const child of frameTree.childFrames || []) flattenFrameTree(child, output);
  return output;
}

async function evaluateInContext(send, sessionId, contextId, expression, awaitPromise = false) {
  const result = await send('Runtime.evaluate', {
    expression,
    contextId,
    awaitPromise,
    returnByValue: true
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(`Frame eval error: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

function frameProbeExpression() {
  return `(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const editors = Array.from(document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]'));
    const visibleEditors = editors.filter(visible);
    return JSON.stringify({
      href: location.href,
      readyState: document.readyState,
      hasDocumentElement: Boolean(document.documentElement),
      hasBody: Boolean(document.body),
      bodyTextLength: String(document.body?.innerText || '').trim().length,
      elementCount: document.querySelectorAll('*').length,
      paragraphCount: document.querySelectorAll('p,li,blockquote,h1,h2,h3,h4,h5,h6,[role="listitem"]').length,
      editorCount: editors.length,
      visibleEditorCount: visibleEditors.length,
      hasCodexComposerHint: visibleEditors.some((element) => /ask|follow-up|message/i.test(String(element.getAttribute('placeholder') || element.getAttribute('aria-label') || '')))
    });
  })()`;
}

function installationProbeExpression() {
  return `(() => {
    const api = window[${JSON.stringify(PATCH_ID)}];
    const compat = window[${JSON.stringify(VSCODE_COMPAT_MARKER)}];
    const style = document.getElementById(${JSON.stringify(CODEx_WEBVIEW_STYLE_ID)});
    const compatStyle = document.getElementById(${JSON.stringify(VSCODE_COMPAT_STYLE_ID)});
    const diag = api && typeof api.diagnostics === 'function' ? api.diagnostics() : null;
    const compatDiag = compat && typeof compat.diagnostics === 'function' ? compat.diagnostics() : null;
    return JSON.stringify({
      href: location.href,
      installed: Boolean(api || compat),
      sharedRuntimeInstalled: Boolean(api),
      compatibilityInstalled: Boolean(compat),
      buildMarker: api?.buildMarker || null,
      runtimeSourceHash: api?.runtimeSourceHash || null,
      cssSourceHash: api?.cssSourceHash || null,
      instanceCount: api?.runtimeInstanceCount || 0,
      observerCount: diag?.observerCount || 0,
      styleConnected: Boolean((style && style.isConnected) || (compatStyle && compatStyle.isConnected) || diag?.style?.connected),
      compatibilityStyleConnected: Boolean(compatStyle && compatStyle.isConnected),
      readyState: document.readyState,
      composerFound: Boolean(compatDiag?.composerFound || diag?.composer?.found),
      composerDirection: compatDiag?.composerDirection || null,
      composerFontFamily: compatDiag?.composerFontFamily || null,
      fontReady: Boolean(compatDiag?.fontReady),
      fontFaceCount: compatDiag?.fontFaceCount || 0,
      fontFaceStatuses: compatDiag?.fontFaceStatuses || [],
      fontError: compatDiag?.fontError || null,
      fontCheck: Boolean(compatDiag?.fontCheck || diag?.fonts?.check),
      fontEntries: (diag?.fonts?.entries || []).length,
      fontApplied: Boolean(compatDiag?.fontApplied),
      rtlApplied: Boolean(compatDiag?.rtlApplied),
      ltrApplied: Boolean(compatDiag?.ltrApplied),
      managedCount: compatDiag?.managedCount || 0,
      rtlCount: compatDiag?.rtlCount || 0,
      ltrCount: compatDiag?.ltrCount || 0,
      visualApplied: Boolean(compatDiag?.visualApplied),
      errors: diag?.errors || []
    });
  })()`;
}

function scoreFrameProbe(probe) {
  if (!probe?.hasDocumentElement || !probe?.hasBody) return -1;
  let score = 0;
  score += Math.min(Number(probe.bodyTextLength || 0), 5000);
  score += Math.min(Number(probe.elementCount || 0), 2000);
  score += Number(probe.paragraphCount || 0) * 20;
  score += Number(probe.editorCount || 0) * 1000;
  score += Number(probe.visibleEditorCount || 0) * 10000;
  if (probe.hasCodexComposerHint) score += 100000;
  return score;
}

async function injectRuntimeIntoFrames(send, sessionId, runtimeSource) {
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: runtimeSource,
    worldName: VSCODE_INJECTION_WORLD,
    runImmediately: true
  }, sessionId);

  const { frameTree } = await send('Page.getFrameTree', {}, sessionId);
  const frames = flattenFrameTree(frameTree);
  const results = [];

  for (const frame of frames) {
    try {
      const { executionContextId } = await send('Page.createIsolatedWorld', {
        frameId: frame.id,
        worldName: `${VSCODE_INJECTION_WORLD}:${frame.id}`,
        grantUniveralAccess: true
      }, sessionId);

      const rawProbe = await evaluateInContext(send, sessionId, executionContextId, frameProbeExpression());
      const probe = JSON.parse(rawProbe);
      if (!probe?.hasDocumentElement || !probe?.hasBody) {
        results.push({ frameId: frame.id, frameUrl: frame.url || probe?.href || '', executionContextId, probe, verification: null, score: -1 });
        continue;
      }

      await evaluateInContext(send, sessionId, executionContextId, runtimeSource, false);
      await sleep(150);
      await evaluateInContext(send, sessionId, executionContextId, `(async () => {
        const api = window[${JSON.stringify(PATCH_ID)}];
        if (api && typeof api.ensure === 'function') api.ensure('vscode-frame-inject');
        const compat = window[${JSON.stringify(VSCODE_COMPAT_MARKER)}];
        if (compat && typeof compat.ensureFontLoaded === 'function') {
          await compat.ensureFontLoaded();
        }
        if (compat && typeof compat.refresh === 'function') compat.refresh('vscode-frame-inject');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return true;
      })()`, true);

      const rawVerification = await evaluateInContext(send, sessionId, executionContextId, installationProbeExpression());
      const verification = JSON.parse(rawVerification);
      const score = scoreFrameProbe(probe) + (verification.visualApplied ? 1000000 : 0);
      results.push({ frameId: frame.id, frameUrl: frame.url || probe.href || '', executionContextId, probe, verification, score });
      log(`Frame injection: frameId=${frame.id} href=${probe.href || frame.url || ''} editors=${probe.visibleEditorCount || 0} text=${probe.bodyTextLength || 0} installed=${Boolean(verification.installed)} visual=${Boolean(verification.visualApplied)} managed=${verification.managedCount || 0}`);
    } catch (error) {
      results.push({ frameId: frame.id, frameUrl: frame.url || '', executionContextId: null, probe: null, verification: null, score: -1, error: error.message });
      log(`Frame injection error: frameId=${frame.id} url=${frame.url || ''} error=${error.message}`);
    }
  }

  const successful = results
    .filter((entry) => entry.verification?.installed && entry.verification?.styleConnected && entry.verification?.visualApplied)
    .sort((a, b) => b.score - a.score);
  const best = successful[0] || results.slice().sort((a, b) => b.score - a.score)[0] || null;

  return {
    frameCount: frames.length,
    contextCount: results.filter((entry) => entry.executionContextId != null).length,
    results,
    best,
    verification: best?.verification || {
      installed: false,
      styleConnected: false,
      visualApplied: false,
      fontApplied: false,
      rtlApplied: false,
      ltrApplied: false,
      managedCount: 0,
      composerFound: false
    }
  };
}

export function buildValidatedStateUpdate(state, targetInfo, runtime) {
  return {
    ...state,
    validatedTarget: {
      id: targetInfo.targetId,
      type: targetInfo.type,
      url: targetInfo.url,
      parentId: targetInfo.parentId || null
    },
    runtime: {
      installed: Boolean(runtime?.installed),
      styleConnected: Boolean(runtime?.styleConnected),
      injectedAt: runtime?.injectedAt || new Date().toISOString(),
      ...(runtime?.compatibilityInstalled != null ? { compatibilityInstalled: Boolean(runtime.compatibilityInstalled) } : {}),
      ...(runtime?.compatibilityStyleConnected != null ? { compatibilityStyleConnected: Boolean(runtime.compatibilityStyleConnected) } : {}),
      ...(runtime?.composerFound != null ? { composerFound: Boolean(runtime.composerFound) } : {}),
      ...(runtime?.composerDirection != null ? { composerDirection: runtime.composerDirection } : {}),
      ...(runtime?.composerFontFamily != null ? { composerFontFamily: runtime.composerFontFamily } : {}),
      ...(runtime?.fontReady != null ? { fontReady: Boolean(runtime.fontReady) } : {}),
      ...(runtime?.fontFaceCount != null ? { fontFaceCount: runtime.fontFaceCount } : {}),
      ...(runtime?.fontFaceStatuses != null ? { fontFaceStatuses: runtime.fontFaceStatuses } : {}),
      ...(runtime?.fontError != null ? { fontError: runtime.fontError } : {}),
      ...(runtime?.fontCheck != null ? { fontCheck: Boolean(runtime.fontCheck) } : {}),
      ...(runtime?.fontApplied != null ? { fontApplied: Boolean(runtime.fontApplied) } : {}),
      ...(runtime?.rtlApplied != null ? { rtlApplied: Boolean(runtime.rtlApplied) } : {}),
      ...(runtime?.ltrApplied != null ? { ltrApplied: Boolean(runtime.ltrApplied) } : {}),
      ...(runtime?.managedCount != null ? { managedCount: runtime.managedCount } : {}),
      ...(runtime?.rtlCount != null ? { rtlCount: runtime.rtlCount } : {}),
      ...(runtime?.ltrCount != null ? { ltrCount: runtime.ltrCount } : {}),
      ...(runtime?.visualApplied != null ? { visualApplied: Boolean(runtime.visualApplied) } : {}),
      ...(runtime?.frameId != null ? { frameId: runtime.frameId } : {}),
      ...(runtime?.frameUrl != null ? { frameUrl: runtime.frameUrl } : {}),
      ...(runtime?.frameCount != null ? { frameCount: runtime.frameCount } : {}),
      ...(runtime?.contextCount != null ? { contextCount: runtime.contextCount } : {})
    }
  };
}

// ── Target scanning ─────────────────────────────────────────────
export async function processTargetInfo(send, runtimeSource, tracker, targetInfo, options = {}) {
  const logFn = options.logFn || log;
  const targetId = String(targetInfo?.targetId || targetInfo?.id || '');
  const resolved = options.resolvedCandidate || await resolveCodexTargetCandidate(send, targetInfo, options.jsonTarget || null, options);

  logFn(formatCodexCandidateLog(resolved));

  if (!resolved.accepted) {
    if (resolved.reason === 'invalid-url' && resolved.type === 'iframe') {
      tracker.markPending(targetId);
      return { status: 'pending', reason: resolved.reason };
    }
    tracker.markRejected(targetId);
    return { status: 'rejected', reason: resolved.reason };
  }

  if (!tracker.start(targetId)) {
    return { status: 'skipped', reason: tracker.injectedTargetIds.has(targetId) ? 'already-injected' : 'busy' };
  }

  let sessionId = resolved.sessionId || null;
  try {
    if (!sessionId) {
      const attached = await send('Target.attachToTarget', { targetId, flatten: true });
      sessionId = attached.sessionId;
      log(`Attached target session: targetId=${targetId} sessionId=${sessionId}`);
      await send('Runtime.enable', {}, sessionId);
    }

    const probe = resolved.probe || await waitForWebviewReady(send, sessionId, options.timeoutMs || 5000, options.intervalMs || 250);
    if (!probe || !probe.hasDocumentElement || !probe.hasBody) {
      tracker.markPending(targetId);
      return { status: 'pending', reason: 'body-not-ready', probe };
    }

    const probeTarget = { type: resolved.type, url: probe.href };
    if (!isCodexWebviewTarget(probeTarget)) {
      tracker.markRejected(targetId);
      return { status: 'rejected', reason: 'probe-url-mismatch', probe };
    }

    const finalUrl = probe.href || resolved.url;
    logFn(`Validated Codex Webview: id=${targetId} type=${resolved.type} href=${finalUrl}`);

    const frameInjection = await injectRuntimeIntoFrames(send, sessionId, runtimeSource);
    const verification = frameInjection.verification;
    const runtimeInstalled = Boolean(verification.installed);
    const styleConnected = Boolean(verification.styleConnected);
    const visualApplied = verification.visualApplied === true;

    logFn(`Runtime installed: ${runtimeInstalled}`);
    logFn(`Style connected: ${styleConnected}`);
    logFn(`Visual applied: ${visualApplied} fontReady=${Boolean(verification.fontReady)} fontApplied=${Boolean(verification.fontApplied)} fontFaces=${verification.fontFaceCount || 0} fontError=${verification.fontError || 'none'} rtlApplied=${Boolean(verification.rtlApplied)} composerFound=${Boolean(verification.composerFound)} managedCount=${verification.managedCount || 0}`);

    if (!runtimeInstalled || !styleConnected || !visualApplied) {
      tracker.markPending(targetId);
      return { status: 'pending', reason: 'runtime-visual-verification-failed', probe, verification };
    }

    await evaluate(send, sessionId, `(() => {
      const api = window[${JSON.stringify(PATCH_ID)}];
      if (api && api.ensure) api.ensure('vscode-inject');
      return 'ok';
    })()`, true);

    tracker.markInjected(targetId);
    const state = sanitizePersistedState(loadState() || {});
    saveState(buildValidatedStateUpdate(state, {
      targetId,
      type: resolved.type,
      url: finalUrl,
      parentId: resolved.parentId || null
    }, {
      installed: true,
      styleConnected: true,
      compatibilityInstalled: verification.compatibilityInstalled,
      compatibilityStyleConnected: verification.compatibilityStyleConnected,
      composerFound: verification.composerFound,
      composerDirection: verification.composerDirection,
      composerFontFamily: verification.composerFontFamily,
      fontReady: verification.fontReady,
      fontFaceCount: verification.fontFaceCount,
      fontFaceStatuses: verification.fontFaceStatuses,
      fontError: verification.fontError,
      fontCheck: verification.fontCheck,
      fontApplied: verification.fontApplied,
      rtlApplied: verification.rtlApplied,
      ltrApplied: verification.ltrApplied,
      managedCount: verification.managedCount,
      rtlCount: verification.rtlCount,
      ltrCount: verification.ltrCount,
      visualApplied,
      frameId: frameInjection.best?.frameId || null,
      frameUrl: frameInjection.best?.probe?.href || frameInjection.best?.frameUrl || null,
      frameCount: frameInjection.frameCount,
      contextCount: frameInjection.contextCount,
      injectedAt: new Date().toISOString()
    }));

    return { status: 'injected', probe, verification, sessionId, frameInjection };
  } catch (err) {
    tracker.markPending(targetId);
    throw err;
  }
}

export async function scanAndInject(send, runtimeSource, tracker, targetInfos = [], options = {}) {
  let injected = false;
  for (const targetInfo of targetInfos) {
    if (!targetInfo || !targetInfo.targetId) continue;
    if (tracker.injectedTargetIds.has(targetInfo.targetId) || tracker.processingTargetIds.has(targetInfo.targetId) || tracker.rejectedTargetIds.has(targetInfo.targetId)) continue;
    try {
      const jsonTarget = options.jsonTargetMap ? options.jsonTargetMap.get(String(targetInfo.targetId || targetInfo.id || '')) || null : options.jsonTarget || null;
      const result = await processTargetInfo(send, runtimeSource, tracker, targetInfo, { ...options, jsonTarget });
      if (result.status === 'injected') injected = true;
    } catch (err) {
      (options.logFn || log)(`Target scan error: ${err.message}`);
    }
  }
  return injected;
}

// ── Electron spawn helper ───────────────────────────────────────
function spawnElectron(execPath, port, workspace, profileMode = 'normal') {
  const launchArgs = buildVSCodeLaunchArgs(port, workspace, profileMode);

  log(`VS Code Electron: ${execPath}`);
  log(`Profile mode: ${profileMode}`);
  log(`Launching: ${execPath} ${launchArgs.join(' ')}`);
  const child = spawn(execPath, launchArgs, {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env }
  });
  child.unref();
  return { child, electronPid: child.pid, launchArgs };
}

// ── Build runtime source (shared by all modes) ──────────────────
function buildRuntime(diagnoseMode) {
  const fontAssets = loadFontAssets();
  log(`Font mode: ${fontAssets.variable ? 'variable' : 'static'}`);

  const runtimeSourceHash = sha256Hex(readFileSync(RUNTIME_PATH));
  const cssSourceHash = sha256Hex(readFileSync(CSS_PATH));
  const runtimeSource = buildInjectionSource(fontAssets, {
    buildMarker: RUNTIME_BUILD_MARKER,
    runtimeSourceHash,
    cssSourceHash,
    diagnosticMode: diagnoseMode
  });
  log(`Runtime source: ${runtimeSource.length} chars`);

  const bareAssignments = runtimeSource.match(/(?:const|let|var)\s+\w+\s*=\s*__[A-Z_]+__/g);
  if (bareAssignments && bareAssignments.length > 0) {
    throw new Error(`Unsubstituted placeholders: ${bareAssignments.join('; ')}`);
  }
  log('Placeholders validated');

  return { runtimeSource, runtimeSourceHash, cssSourceHash };
}

// ── Watcher loop (shared by daemon and foreground) ──────────────
async function watcherLoop(send, on, ws, runtimeSource, tracker, port) {
  const discoveryState = {
    jsonTargetsById: new Map()
  };

  const discoverTargets = async () => {
    await send('Target.setDiscoverTargets', { discover: true });
    await send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [
        { type: 'page', exclude: false },
        { type: 'iframe', exclude: false },
        { type: 'worker', exclude: false }
      ]
    });
  };

  const registerTargetListeners = () => {
    on('Target.targetCreated', async (params) => {
      try {
        const targetInfo = params.targetInfo || {};
        const jsonTarget = discoveryState.jsonTargetsById.get(String(targetInfo.targetId || targetInfo.id || '')) || null;
        await processTargetInfo(send, runtimeSource, tracker, targetInfo, { logFn: log, jsonTarget });
      } catch (err) {
        log(`Target scan error: ${err.message}`);
      }
    });

    on('Target.targetDestroyed', (params) => {
      tracker.forget(params.targetId);
      log(`Target destroyed: id=${params.targetId}`);
    });

    on('Target.detachedFromTarget', (params) => {
      if (params?.targetId) tracker.forget(params.targetId);
    });
  };

  const scanExistingTargets = async () => {
    const jsonListTargets = await fetchJsonListTargets(port);
    discoveryState.jsonTargetsById = buildJsonListTargetMap(jsonListTargets);
    const { targetInfos } = await send('Target.getTargets');
    const currentState = loadState() || {};
    const liveState = sanitizePersistedState(currentState, discoveryState.jsonTargetsById);
    if (liveState !== currentState) saveState(liveState);
    await scanAndInject(send, runtimeSource, tracker, targetInfos, { jsonTargetMap: discoveryState.jsonTargetsById });
  };

  registerTargetListeners();

  await discoverTargets();
  await scanExistingTargets();

  while (true) {
    await sleep(5000);
    try {
      await scanExistingTargets();
    } catch (err) {
      log(`Scan error: ${err.message}`);
      try {
        const freshVersion = await waitForCDP(port, 5000);
        const freshConn = await cdpConnect(freshVersion.webSocketDebuggerUrl);
        send = freshConn.send;
        on = freshConn.on;
        ws = freshConn.ws;
        registerTargetListeners();
        await discoverTargets();
        tracker.injectedTargetIds.clear();
        tracker.pendingTargetIds.clear();
        tracker.processingTargetIds.clear();
        tracker.rejectedTargetIds.clear();
        log('CDP reconnected');
      } catch {
        log('CDP reconnect failed, will retry');
      }
    }
  }
}

// ── Daemon mode (--daemon) — launchd-managed ───────────────────
async function runDaemon(args) {
  const workspace = args.find(a => !a.startsWith('-')) || null;
  const diagnoseMode = args.includes('--diagnose');
  const profileMode = getProfileMode(args);

  // ── Exit diagnostics ──────────────────────────────────────────
  let daemonElectronPid = null;
  let daemonPort = null;

  function exitLog(event, detail) {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${event}: adapterPid=${process.pid} electronPid=${daemonElectronPid || '?'} port=${daemonPort || '?'} ${detail || ''}\n`;
    try { appendFileSync(LOG_FILE, line); } catch {}
  }

  process.on('uncaughtException', (err) => {
    exitLog('uncaughtException', `name=${err.name} message=${err.message} stack=${err.stack}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    exitLog('unhandledRejection', `reason=${reason}`);
    process.exit(1);
  });
  process.on('SIGTERM', () => { exitLog('SIGTERM', 'received'); process.exit(0); });
  process.on('SIGINT', () => { exitLog('SIGINT', 'received'); process.exit(0); });
  process.on('SIGHUP', () => { exitLog('SIGHUP', 'received'); process.exit(0); });
  process.on('beforeExit', (code) => { exitLog('beforeExit', `code=${code}`); });
  process.on('exit', (code) => { exitLog('exit', `code=${code}`); });

  exitLog('daemon_started', `serviceLabel=${SERVICE_LABEL}`);

  // ── Find VS Code ──────────────────────────────────────────────
  const appPath = findVSCodeApp();
  log(`VS Code: ${appPath}`);

  const execPath = getVSCodeExecutable(appPath);
  if (!execPath.endsWith('/Contents/MacOS/Electron')) {
    throw new Error(`VS Code executable must end with /Contents/MacOS/Electron, got: ${execPath}`);
  }
  if (profileMode === 'normal') assertNormalVSCodeAvailable(execPath);

  // ── Build runtime ─────────────────────────────────────────────
  const { runtimeSource, runtimeSourceHash, cssSourceHash } = buildRuntime(diagnoseMode);
  const preexistingState = loadState();
  if (preexistingState) {
    const sanitizedState = sanitizePersistedState(preexistingState);
    if (sanitizedState !== preexistingState) saveState(sanitizedState);
  }

  // ── Resilient connection + watch loop ──────────────────────────
  const tracker = createCodexTargetTracker();
  let currentElectronPid = null;
  let currentPort = null;

  const daemonLoop = async () => {
    while (true) {
      try {
        // Pick port
        const port = await pickPort();
        currentPort = port;
        daemonPort = port;
        log(`Debug port: ${port}`);

        // Launch Electron
        mkdirSync(STATE_DIR, { recursive: true });
        const { child, electronPid } = spawnElectron(execPath, port, workspace, profileMode);
        currentElectronPid = electronPid;
        daemonElectronPid = electronPid;

        // Track Electron exit — relaunch it, never exit daemon
        child.on('exit', (code, signal) => {
          exitLog('electron_exit', `code=${code} signal=${signal}`);
          log(`Electron exited (code=${code}, signal=${signal}). Will relaunch.`);
          currentElectronPid = null;
        });

        // Write daemon state
        const now = new Date().toISOString();
        saveState({
          port,
          browserWsUrl: null,
          adapterPid: process.pid,
          electronPid,
          mode: 'background',
          profileMode,
          serviceLabel: SERVICE_LABEL,
          plistPath: PLIST_PATH,
          executablePath: execPath,
          appPath,
          adapterStorageDir: STATE_DIR,
          profileDir: profileMode === 'isolated' ? STATE_DIR : null,
          logFile: LOG_FILE,
          workspace: workspace || null,
          runtimeSourceHash,
          cssSourceHash,
          createdAt: now,
          lastUpdatedAt: now,
          lastHeartbeatAt: now
        });
        log(`Daemon state saved: adapterPid=${process.pid}, electronPid=${electronPid}`);

        // Wait for CDP
        const version = await waitForCDP(port);
        log(`CDP ready: ${version.Browser}`);

        // Update state with CDP info
        saveState({
          port,
          browserWsUrl: version.webSocketDebuggerUrl,
          adapterPid: process.pid,
          electronPid,
          mode: 'background',
          profileMode,
          serviceLabel: SERVICE_LABEL,
          plistPath: PLIST_PATH,
          executablePath: execPath,
          appPath,
          adapterStorageDir: STATE_DIR,
          profileDir: profileMode === 'isolated' ? STATE_DIR : null,
          logFile: LOG_FILE,
          workspace: workspace || null,
          runtimeSourceHash,
          cssSourceHash,
          createdAt: now,
          lastUpdatedAt: new Date().toISOString(),
          lastHeartbeatAt: new Date().toISOString()
        });

        // Connect
        const { ws, send, on } = await cdpConnect(version.webSocketDebuggerUrl);

        // Enable target discovery
        await send('Target.setDiscoverTargets', { discover: true });
        await send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true,
          filter: [
            { type: 'page', exclude: false },
            { type: 'webview', exclude: false },
            { type: 'iframe', exclude: false },
            { type: 'worker', exclude: false }
          ]
        });

        log('Daemon watching for Codex Webview...');

        // Heartbeat updater — runs every 10s
        const heartbeatInterval = setInterval(() => {
          try {
            const state = loadState();
            if (state) {
              state.lastHeartbeatAt = new Date().toISOString();
              saveState(state);
            }
          } catch {}
        }, 10000);
        heartbeatInterval.unref();

        // Watcher loop — stays alive until WebSocket dies
        await watcherLoop(send, on, ws, runtimeSource, tracker, port);

        // WebSocket died — clear heartbeat, clean up Electron, retry
        clearInterval(heartbeatInterval);
        log('Watcher loop ended. Attempting CDP reconnection...');
        try { ws.close(); } catch {}
        if (currentElectronPid) {
          try { process.kill(currentElectronPid, 'SIGTERM'); } catch {}
        }
        await sleep(2000);
      } catch (err) {
        log(`Daemon error: ${err.message}. Retrying in 3s...`);
        exitLog('daemon_error', `message=${err.message}`);
        await sleep(3000);
      }
    }
  };

  await daemonLoop();
}

// ── Background bootstrap (--bg) — launchctl-managed ─────────────
async function runBackground(args) {
  const workspace = args.find(a => !a.startsWith('-')) || null;
  const diagnoseMode = args.includes('--diagnose');
  const profileMode = getProfileMode(args);

  appendFileSync(LOG_FILE, `\n--- Bootstrap started at ${new Date().toISOString()} ---\n`);
  log('Starting background service via launchd...');

  // 1. Validate paths
  mkdirSync(STATE_DIR, { recursive: true });

  const nodeExec = process.execPath;
  if (!existsSync(nodeExec)) throw new Error(`Node executable not found: ${nodeExec}`);
  if (!existsSync(LAUNCHER_SCRIPT)) throw new Error(`Launcher script not found: ${LAUNCHER_SCRIPT}`);

  if (profileMode === 'normal') {
    const appPath = findVSCodeApp();
    const execPath = getVSCodeExecutable(appPath);
    assertNormalVSCodeAvailable(execPath);
  }

  log(`Node: ${nodeExec}`);
  log(`Profile mode: ${profileMode}`);
  log(`Script: ${LAUNCHER_SCRIPT}`);
  log(`Plist: ${PLIST_PATH}`);
  log(`Service label: ${SERVICE_LABEL}`);

  // 2. Remove stale service if loaded
  if (launchctlIsLoaded()) {
    log('Stale service found. Removing...');
    launchctlRemoveStale();
    await sleep(1000);
  }

  // 3. Write plist atomically
  const plistContent = generatePlist({
    nodeExecutable: nodeExec,
    scriptPath: LAUNCHER_SCRIPT,
    logFile: LOG_FILE,
    workingDir: PROJECT_ROOT,
    extraArguments: [
      ...(profileMode === 'isolated' ? ['--isolated'] : []),
      ...(diagnoseMode ? ['--diagnose'] : []),
      ...(workspace ? [workspace] : [])
    ]
  });
  writePlist(plistContent);
  log(`Plist written: ${PLIST_PATH}`);

  // 4. Bootstrap the service
  log('Bootstrapping LaunchAgent...');
  const bootstrapResult = launchctlBootstrap();
  if (!bootstrapResult.ok) {
    log(`Bootstrap warning: ${bootstrapResult.stderr || bootstrapResult.stdout}`);
  }

  // 5. Kickstart to ensure it's running
  log('Kickstarting service...');
  const kickstartResult = launchctlKickstart();
  if (!kickstartResult.ok) {
    log(`Kickstart warning: ${kickstartResult.stderr || kickstartResult.stdout}`);
  }

  // 6. Wait until launchctl reports the service
  log('Waiting for service to appear in launchctl...');
  const serviceDeadline = Date.now() + 15000;
  while (Date.now() < serviceDeadline) {
    if (launchctlIsLoaded()) {
      log('Service loaded in launchd.');
      break;
    }
    await sleep(500);
  }
  if (!launchctlIsLoaded()) {
    log('WARNING: Service not confirmed in launchctl after 15s.');
  }

  // 7. Wait until state reports mode=background
  log('Waiting for daemon state...');
  const stateDeadline = Date.now() + 30000;
  while (Date.now() < stateDeadline) {
    const state = loadState();
    if (state && state.mode === 'background' && state.profileMode === profileMode && state.adapterPid) {
      // Verify the adapter PID is alive
      const { alive } = checkPid(state.adapterPid);
      if (alive) {
        // 8. Wait until CDP is reachable
        log(`Daemon alive: adapterPid=${state.adapterPid}, electronPid=${state.electronPid}, port=${state.port}, profileMode=${state.profileMode}`);
        const cdpInfo = await checkCDP(state.port, 15000);
        if (cdpInfo) {
          log(`CDP reachable: ${cdpInfo.Browser}`);
          log('Background service confirmed healthy.');
          process.exit(0);
        }
        log('CDP not reachable yet. Waiting...');
      }
    }
    await sleep(1000);
  }

  log('Timed out waiting for background service health confirmation.');
  process.exit(1);
}

// ── Foreground mode (default) ───────────────────────────────────
async function runForeground(args) {
  const workspace = args.find(a => !a.startsWith('-')) || null;
  const diagnoseMode = args.includes('--diagnose');
  const profileMode = getProfileMode(args);

  // 1. Find VS Code
  const appPath = findVSCodeApp();
  log(`VS Code: ${appPath}`);

  // 2. Pick dynamic port
  const port = await pickPort();
  log(`Debug port: ${port}`);

  // 3. Build runtime
  const { runtimeSource, runtimeSourceHash, cssSourceHash } = buildRuntime(diagnoseMode);
  const preexistingState = loadState();
  if (preexistingState) {
    const sanitizedState = sanitizePersistedState(preexistingState);
    if (sanitizedState !== preexistingState) saveState(sanitizedState);
  }

  // 4. Launch Electron
  mkdirSync(STATE_DIR, { recursive: true });
  const execPath = getVSCodeExecutable(appPath);
  if (!execPath.endsWith('/Contents/MacOS/Electron')) {
    throw new Error(`VS Code executable must end with /Contents/MacOS/Electron, got: ${execPath}`);
  }
  if (profileMode === 'normal') assertNormalVSCodeAvailable(execPath);
  const { child, electronPid } = spawnElectron(execPath, port, workspace, profileMode);

  // 5. Save initial state
  const now = new Date().toISOString();
  saveState({
    port,
    browserWsUrl: null,
    adapterPid: process.pid,
    electronPid,
    bootstrapPid: null,
    mode: 'foreground',
    profileMode,
    executablePath: execPath,
    appPath,
    adapterStorageDir: STATE_DIR,
    profileDir: profileMode === 'isolated' ? STATE_DIR : null,
    logFile: null,
    workspace: workspace || null,
    runtimeSourceHash,
    cssSourceHash,
    createdAt: now,
    lastUpdatedAt: now,
    lastHeartbeatAt: now
  });
  log(`State saved to ${STATE_FILE}`);

  // 6-12. CDP connection + watcher loop (resilient to Electron restarts)
  const tracker = createCodexTargetTracker();

  const connectAndWatch = async () => {
    while (true) {
      try {
        // 6. Wait for CDP
        const version = await waitForCDP(port);
        log(`CDP ready: ${version.Browser}`);

        // 7. Update state
        saveState({
          port,
          browserWsUrl: version.webSocketDebuggerUrl,
          adapterPid: process.pid,
          electronPid,
          bootstrapPid: null,
          mode: 'foreground',
          profileMode,
          executablePath: execPath,
          appPath,
          adapterStorageDir: STATE_DIR,
          profileDir: profileMode === 'isolated' ? STATE_DIR : null,
          logFile: null,
          workspace: workspace || null,
          runtimeSourceHash,
          cssSourceHash,
          createdAt: now,
          lastUpdatedAt: new Date().toISOString(),
          lastHeartbeatAt: new Date().toISOString()
        });

        // 8. Connect
        const { ws, send, on } = await cdpConnect(version.webSocketDebuggerUrl);

        // 9. Enable target discovery
        await send('Target.setDiscoverTargets', { discover: true });
        await send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true,
          filter: [
            { type: 'page', exclude: false },
            { type: 'webview', exclude: false },
            { type: 'iframe', exclude: false },
            { type: 'worker', exclude: false }
          ]
        });

        // 10. Report status
        log('');
        log('Waiting for Codex Webview. Open the Codex panel in this VS Code window.');
        log(`State file: ${STATE_FILE}`);
        log(`PID: ${process.pid}`);
        log(`Port: ${port}`);
        log('');

        // Watcher loop — stays alive forever (returns when WebSocket dies)
        await watcherLoop(send, on, ws, runtimeSource, tracker, port);

        // watcherLoop returned — WebSocket died, try to reconnect
        log('Watcher loop ended. Attempting CDP reconnection...');
        await sleep(2000);
      } catch (err) {
        log(`CDP connection error: ${err.message}. Retrying in 3s...`);
        await sleep(3000);
      }
    }
  };

  // 11. Handle shutdown signals — terminate owned Electron
  const shutdown = (signal) => {
    log(`Received ${signal}. Shutting down adapter...`);
    try { process.kill(electronPid, 'SIGTERM'); } catch {}
    clearState();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await connectAndWatch();
}

// ── Entry point ─────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--daemon')) {
    await runDaemon(args.filter(a => a !== '--daemon'));
  } else if (args.includes('--bg')) {
    await runBackground(args.filter(a => a !== '--bg'));
  } else {
    await runForeground(args);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`FATAL: ${error.stack || error.message}\n`);
    process.exit(1);
  });
}
