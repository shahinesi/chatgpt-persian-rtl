#!/usr/bin/env node
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');
const runtimePath = path.join(desktopRoot, 'shared', 'rtl-runtime.js');
const cssPath = path.join(desktopRoot, 'shared', 'rtl-patch.css');
const appPath = '/Applications/ChatGPT.app';
const bundleId = 'com.openai.codex';
const patchId = 'chatgpt-persian-rtl-desktop-runtime';
const args = new Set(process.argv.slice(2));
const canaryMode = args.has('--canary');
const proofCss = [
  '.ProseMirror {',
  '  outline: 3px solid red !important;',
  '}'
].join('\n');

function log(message) {
  process.stdout.write(`${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a loopback port')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function waitForProcessExit(command, pattern, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
    if (result.status !== 0) return true;
    if (!result.stdout.includes(pattern)) return true;
  }
  return false;
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function inspectFontMetadata(fontPath) {
  const script = `
import json
import sys
from fontTools.ttLib import TTFont

font_path = sys.argv[1]
font = TTFont(font_path)
name = font["name"]
family = name.getDebugName(1) or ""
subfamily = name.getDebugName(2) or ""
weight = int(font["OS/2"].usWeightClass)
style = "italic" if getattr(font.get("post"), "italicAngle", 0) not in (0, None) else "normal"
axes = []
if "fvar" in font:
    for axis in font["fvar"].axes:
        axes.append({
            "tag": axis.axisTag,
            "min": float(axis.minValue),
            "default": float(axis.defaultValue),
            "max": float(axis.maxValue)
        })

print(json.dumps({
    "family": family,
    "subfamily": subfamily,
    "weight": weight,
    "style": style,
    "axes": axes,
    "isVariable": bool(axes)
}))
`;
  const result = spawnSync('python3', ['-c', script, fontPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Failed to inspect font metadata for ${fontPath}`).trim());
  }
  return JSON.parse(result.stdout.trim());
}

function readValidatedFontAsset(fontRoot, fileName) {
  const fontPath = path.join(fontRoot, fileName);
  const stat = statSync(fontPath);
  if (!stat.isFile()) {
    throw new Error(`Font file is missing: ${fontPath}`);
  }
  if (stat.size <= 0) {
    throw new Error(`Font file is empty: ${fontPath}`);
  }

  const buffer = readFileSync(fontPath);
  if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== 'wOF2') {
    throw new Error(`Font file is not a valid WOFF2 file: ${fontPath}`);
  }

  const sha256 = sha256Hex(buffer);
  const base64 = buffer.toString('base64');
  return {
    fileName,
    fontPath,
    size: stat.size,
    sha256,
    signature: buffer.subarray(0, 4).toString('ascii'),
    base64Size: base64.length,
    dataUrl: `data:font/woff2;base64,${base64}`,
    metadata: inspectFontMetadata(fontPath)
  };
}

function quitExistingApp() {
  spawnSync('osascript', ['-e', `tell application id "${bundleId}" to quit`], { stdio: 'ignore' });
  spawnSync('pkill', ['-x', 'ChatGPT'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'], { stdio: 'ignore' });
  spawnSync('pkill', ['-f', '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework'], { stdio: 'ignore' });
  waitForProcessExit(['pgrep', '-fl', 'ChatGPT'], 'ChatGPT');
}

function buildFontFaceBlocks(fontMode, fontAssets) {
  if (fontMode === 'variable') {
    return `
@font-face {
  font-family: "Vazirmatn";
  src: url("${fontAssets.variable.dataUrl}") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
`;
  }

  return [
    { weight: 100, asset: fontAssets.thin },
    { weight: 200, asset: fontAssets.extraLight },
    { weight: 300, asset: fontAssets.light },
    { weight: 400, asset: fontAssets.regular },
    { weight: 500, asset: fontAssets.medium },
    { weight: 600, asset: fontAssets.semiBold },
    { weight: 700, asset: fontAssets.bold },
    { weight: 800, asset: fontAssets.extraBold },
    { weight: 900, asset: fontAssets.black }
  ].map(({ weight, asset }) => `
@font-face {
  font-family: "Vazirmatn";
  src: url("${asset.dataUrl}") format("woff2");
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
}
`).join('\n');
}

function buildInjectionSource(fontMode, fontAssets) {
  const css = readFileSync(cssPath, 'utf8');
  const inlinedCss = css.replace('__FONT_FACE_BLOCKS__', buildFontFaceBlocks(fontMode, fontAssets));
  const sourceCss = canaryMode ? `${inlinedCss}\n${proofCss}` : inlinedCss;
  const runtime = readFileSync(runtimePath, 'utf8').replace('__CHATGPT_PERSIAN_RTL_CSS__', JSON.stringify(sourceCss));
  return runtime;
}

async function cdpConnect(browserWebSocketUrl) {
  const ws = new WebSocket(browserWebSocketUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 1;
  const pending = new Map();
  const browserHandlers = new Map();
  const sessionHandlers = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id != null && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }

    const dispatch = [];
    const browserSet = browserHandlers.get(message.method);
    if (browserSet) dispatch.push(...browserSet);

    if (message.sessionId && sessionHandlers.has(message.sessionId)) {
      const sessionSet = sessionHandlers.get(message.sessionId).get(message.method);
      if (sessionSet) dispatch.push(...sessionSet);
    }

    for (const handler of dispatch) {
      Promise.resolve()
        .then(() => handler(message.params, message))
        .catch((error) => {
          process.stderr.write(`${error.stack || error.message}\n`);
        });
    }
  };

  ws.onclose = () => {
    for (const { reject } of pending.values()) {
      reject(new Error('CDP connection closed'));
    }
    pending.clear();
  };

  function send(method, params = {}, sessionId = null) {
    const id = nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function on(method, handler, sessionId = null) {
    if (sessionId) {
      if (!sessionHandlers.has(sessionId)) {
        sessionHandlers.set(sessionId, new Map());
      }
      const sessionMap = sessionHandlers.get(sessionId);
      if (!sessionMap.has(method)) {
        sessionMap.set(method, new Set());
      }
      sessionMap.get(method).add(handler);
      return;
    }

    if (!browserHandlers.has(method)) {
      browserHandlers.set(method, new Set());
    }
    browserHandlers.get(method).add(handler);
  }

  return { ws, send, on };
}

async function waitForJsonVersion(port) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`Timed out waiting for CDP endpoint on ${url}`);
}

function isRelevantTarget(targetInfo) {
  return ['page', 'webview', 'iframe', 'worker', 'service_worker'].includes(targetInfo.type);
}

function isDomTarget(targetInfo) {
  return ['page', 'webview', 'iframe'].includes(targetInfo.type);
}

function shouldAttachTarget(targetInfo) {
  if (!isRelevantTarget(targetInfo)) return false;
  if (targetInfo.type === 'page' && !targetInfo.url) return true;
  return true;
}

function createDiagnosticsReader(send, sessionId) {
  const expression = `(() => {
    const api = window[${JSON.stringify(patchId)}];
    return api ? api.diagnostics() : { installed: false, missing: true, href: location.href };
  })()`;
  return send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
}

function createEnsureReader(send, sessionId, reason) {
  const expression = `(() => {
    const api = window[${JSON.stringify(patchId)}];
    if (!api) {
      throw new Error('RTL runtime is not installed');
    }
    return api.ensure(${JSON.stringify(reason)});
  })()`;
  return send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
}

async function readDiagnostics(send, sessionId) {
  const result = await createDiagnosticsReader(send, sessionId);
  return result.result.value;
}

async function runEnsure(send, sessionId, reason) {
  const result = await createEnsureReader(send, sessionId, reason);
  return result.result.value;
}

async function main() {
  const port = await pickPort();
  const fontRoot = path.join(desktopRoot, 'shared', 'fonts');
  const webfontRoot = path.join(fontRoot, 'webfonts');
  const staticCandidates = [
    { key: 'thin', fileName: 'Vazirmatn-Thin.woff2', weight: 100 },
    { key: 'extraLight', fileName: 'Vazirmatn-ExtraLight.woff2', weight: 200 },
    { key: 'light', fileName: 'Vazirmatn-Light.woff2', weight: 300 },
    { key: 'regular', fileName: 'Vazirmatn-Regular.woff2', weight: 400 },
    { key: 'medium', fileName: 'Vazirmatn-Medium.woff2', weight: 500 },
    { key: 'semiBold', fileName: 'Vazirmatn-SemiBold.woff2', weight: 600 },
    { key: 'bold', fileName: 'Vazirmatn-Bold.woff2', weight: 700 },
    { key: 'extraBold', fileName: 'Vazirmatn-ExtraBold.woff2', weight: 800 },
    { key: 'black', fileName: 'Vazirmatn-Black.woff2', weight: 900 }
  ];

  const variableAsset = readValidatedFontAsset(webfontRoot, 'Vazirmatn[wght].woff2');
  const validation = {
    mode: 'variable',
    reason: null,
    variable: {
      filePath: variableAsset.fontPath,
      size: variableAsset.size,
      sha256: variableAsset.sha256,
      signature: variableAsset.signature,
      base64Size: variableAsset.base64Size,
      metadata: variableAsset.metadata
    },
    staticFallback: null
  };

  const variableMetadata = variableAsset.metadata;
  const variableAxes = Array.isArray(variableMetadata.axes) ? variableMetadata.axes : [];
  const variableAxis = variableAxes.find((axis) => axis.tag === 'wght');
  const variableValid = Boolean(
    variableMetadata.family === 'Vazirmatn' &&
    variableMetadata.style === 'normal' &&
    variableMetadata.isVariable === true &&
    variableAxis &&
    variableAxis.min <= 100 &&
    variableAxis.max >= 900
  );

  let fontAssets;
  if (variableValid) {
    fontAssets = { variable: variableAsset };
  } else {
    const fallbackAssets = {};
    const fallbackReasons = [];
    for (const candidate of staticCandidates) {
      const asset = readValidatedFontAsset(webfontRoot, candidate.fileName);
      const meta = asset.metadata;
      const weightOk = meta.family === 'Vazirmatn' && meta.style === 'normal' && meta.weight === candidate.weight && !meta.isVariable;
      if (!weightOk) {
        fallbackReasons.push({
          fileName: candidate.fileName,
          reason: `Expected Vazirmatn ${candidate.weight} normal, got family=${meta.family} style=${meta.style} weight=${meta.weight} variable=${meta.isVariable}`
        });
      }
      fallbackAssets[candidate.key] = asset;
    }
    if (fallbackReasons.length > 0) {
      validation.staticFallback = { selected: false, reasons: fallbackReasons };
      throw new Error(`Variable font invalid and static fallback validation failed: ${JSON.stringify(fallbackReasons)}`);
    }
    validation.mode = 'static';
    validation.reason = `Variable font invalid: family=${variableMetadata.family}, style=${variableMetadata.style}, axes=${JSON.stringify(variableAxes)}`;
    validation.staticFallback = {
      selected: true,
      files: Object.fromEntries(staticCandidates.map((candidate) => {
        const asset = fallbackAssets[candidate.key];
        return [candidate.key, {
          filePath: asset.fontPath,
          size: asset.size,
          sha256: asset.sha256,
          signature: asset.signature,
          weight: candidate.weight,
          base64Size: asset.base64Size,
          metadata: asset.metadata
        }];
      }))
    };
    fontAssets = fallbackAssets;
  }

  quitExistingApp();

  const launcher = spawn('open', ['-na', appPath, '--args',
    '--remote-debugging-port=' + port,
    '--remote-debugging-address=127.0.0.1'
  ], { stdio: 'ignore', detached: true });

  launcher.unref();
  log(`launching ${appPath} on 127.0.0.1:${port}`);

  const version = await waitForJsonVersion(port);
  const { ws, send, on } = await cdpConnect(version.webSocketDebuggerUrl);

  const runtimeSource = buildInjectionSource(validation.mode, fontAssets);
  const targetStates = new Map();
  const sessionStates = new Map();
  const targetToSession = new Map();
  const attachInFlight = new Map();
  const attachLog = [];
  let sessionSequence = 0;

  function isRealDomUrl(url) {
    const value = String(url || '').trim();
    if (!value) return false;
    if (value === 'about:blank' || value === 'about:srcdoc') return false;
    return true;
  }

  function getTargetState(targetId) {
    let targetState = targetStates.get(targetId);
    if (!targetState) {
      targetState = {
        targetId,
        targetInfo: null,
        activeSessionId: null,
        sessions: new Map()
      };
      targetStates.set(targetId, targetState);
    }
    return targetState;
  }

  function createSessionState(targetInfo, sessionId, stage) {
    const state = {
      sessionId,
      targetId: targetInfo.targetId,
      targetInfo,
      attached: false,
      active: false,
      stale: false,
      domTarget: isDomTarget(targetInfo),
      realTarget: isRealDomUrl(targetInfo.url),
      runtimeResult: null,
      lastDiagnostics: null,
      refreshInFlight: null,
      refreshReasons: new Set(),
      bootstrapInFlight: null,
      lastStage: stage,
      history: [],
      attachedSeq: ++sessionSequence
    };
    sessionStates.set(sessionId, state);
    getTargetState(targetInfo.targetId).sessions.set(sessionId, state);
    return state;
  }

  function activateSession(targetInfo, sessionId, stage) {
    const targetState = getTargetState(targetInfo.targetId);
    const previousSessionId = targetState.activeSessionId;
    if (previousSessionId && previousSessionId !== sessionId) {
      const previous = sessionStates.get(previousSessionId);
      if (previous) {
        previous.active = false;
        previous.stale = true;
      }
    }

    let state = sessionStates.get(sessionId);
    if (!state) {
      state = createSessionState(targetInfo, sessionId, stage);
    }

    state.targetInfo = targetInfo;
    state.domTarget = isDomTarget(targetInfo);
    state.realTarget = isRealDomUrl(targetInfo.url);
    state.active = true;
    state.stale = false;
    state.lastStage = stage;
    state.lastSeenAt = Date.now();
    targetState.targetInfo = targetInfo;
    targetState.activeSessionId = sessionId;
    targetState.sessions.set(sessionId, state);
    targetToSession.set(targetInfo.targetId, sessionId);
    return state;
  }

  function getActiveSessionState(targetId) {
    const targetState = targetStates.get(targetId);
    if (!targetState || !targetState.activeSessionId) return null;
    const state = sessionStates.get(targetState.activeSessionId);
    if (!state) return null;
    if (state.stale) return null;
    return state;
  }

  function isActiveRealSession(state) {
    return Boolean(state && state.active && !state.stale && state.domTarget && state.realTarget && isRealDomUrl(state.targetInfo?.url));
  }

  function snapshotTarget(targetInfo) {
    return {
      targetId: targetInfo.targetId,
      type: targetInfo.type,
      url: targetInfo.url,
      title: targetInfo.title
    };
  }

  function recordAttachment(state, diagnostics, stage) {
    state.lastStage = stage;
    state.lastDiagnostics = diagnostics;
    attachLog.push({
      targetId: state.targetId,
      type: state.targetInfo.type,
      url: state.targetInfo.url,
      sessionId: state.sessionId,
      active: state.active,
      stage,
      runtimeInjectionResult: diagnostics?.runtime ?? diagnostics,
      styleInjectionResult: diagnostics?.style ?? diagnostics?.styleState ?? null
    });
  }

  async function bootstrapSession(state, stage) {
    if (state.bootstrapInFlight) return state.bootstrapInFlight;

    state.bootstrapInFlight = (async () => {
      const domTarget = isDomTarget(state.targetInfo) && isRealDomUrl(state.targetInfo.url);
      if (!domTarget) {
        const diagnostics = {
          installed: false,
          reason: stage,
          targetType: state.targetInfo.type,
          skipped: true,
          readyState: null,
          composer: { found: false },
          fonts: {
            ready: false,
            status: null,
            check: { 100: false, 400: false, 500: false, 600: false, 700: false, 900: false },
            load: {
              100: { requested: '100 16px "Vazirmatn"', loaded: 0, ok: false },
              400: { requested: '400 16px "Vazirmatn"', loaded: 0, ok: false },
              500: { requested: '500 16px "Vazirmatn"', loaded: 0, ok: false },
              600: { requested: '600 16px "Vazirmatn"', loaded: 0, ok: false },
              700: { requested: '700 16px "Vazirmatn"', loaded: 0, ok: false },
              900: { requested: '900 16px "Vazirmatn"', loaded: 0, ok: false }
            },
            entries: [],
            canvas: null,
            errors: [],
            fontFaceSources: []
          },
          style: {
            skipped: true,
            targetType: state.targetInfo.type,
            connected: false,
            hasSheet: false,
            ruleCount: 0,
            expectedRuleCount: 0,
            adoptedSheets: 0
          }
        };
        state.lastDiagnostics = diagnostics;
        state.runtimeResult = { skipped: true, targetType: state.targetInfo.type };
        state.attached = false;
        recordAttachment(state, diagnostics, stage);
        return diagnostics;
      }

      if (state.sessionId !== targetToSession.get(state.targetId)) {
        const diagnostics = {
          installed: false,
          reason: stage,
          targetType: state.targetInfo.type,
          skipped: true,
          stale: true,
          readyState: null,
          composer: { found: false }
        };
        state.lastDiagnostics = diagnostics;
        state.runtimeResult = { skipped: true, targetType: state.targetInfo.type, stale: true };
        recordAttachment(state, diagnostics, stage);
        return diagnostics;
      }

      {
        await send('Page.enable', {}, state.sessionId);
        await send('Runtime.enable', {}, state.sessionId);
        await send('Page.addScriptToEvaluateOnNewDocument', { source: runtimeSource }, state.sessionId);
        await send('Runtime.evaluate', { expression: runtimeSource, awaitPromise: false, returnByValue: true }, state.sessionId);
        on('Page.frameNavigated', () => void refreshSession(state, 'Page.frameNavigated'), state.sessionId);
        on('Page.loadEventFired', () => void refreshSession(state, 'Page.loadEventFired'), state.sessionId);
        on('Runtime.executionContextCreated', () => void refreshSession(state, 'Runtime.executionContextCreated'), state.sessionId);
        on('Runtime.executionContextDestroyed', () => void refreshSession(state, 'Runtime.executionContextDestroyed'), state.sessionId);
        on('Runtime.executionContextsCleared', () => void refreshSession(state, 'Runtime.executionContextsCleared'), state.sessionId);
        on('Runtime.consoleAPICalled', (params) => {
          if (!canaryMode) return;
          const text = params?.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ');
          if (text) log(JSON.stringify({ console: text, targetId: state.targetId, sessionId: state.sessionId }));
        }, state.sessionId);
      }

      let runtimeResult = { skipped: false, targetType: state.targetInfo.type };
      let diagnostics = null;
      runtimeResult = await runEnsure(send, state.sessionId, stage);
      diagnostics = await readDiagnostics(send, state.sessionId);
      state.lastDiagnostics = diagnostics;

      state.lastDiagnostics = diagnostics;
      state.runtimeResult = runtimeResult;
      state.domTarget = domTarget;
      state.attached = true;
      recordAttachment(state, diagnostics, stage);
      return diagnostics;
    })()
      .catch((error) => {
        state.bootstrapError = String(error?.stack || error?.message || error);
        throw error;
      })
      .finally(() => {
        state.bootstrapInFlight = null;
      });

    return state.bootstrapInFlight;
  }

  async function refreshSession(state, reason) {
    if (state.sessionId !== targetToSession.get(state.targetId)) return null;
    if (!state.realTarget || !isRealDomUrl(state.targetInfo?.url)) {
      return bootstrapSession(state, reason);
    }
    if (!state.attached) return bootstrapSession(state, reason);
    if (state.refreshInFlight) {
      state.refreshReasons.add(reason);
      return state.refreshInFlight;
    }

    state.refreshReasons = new Set([reason]);
    state.refreshInFlight = (async () => {
      try {
        const diagnostics = await runEnsure(send, state.sessionId, reason);
        const latest = await readDiagnostics(send, state.sessionId);
        state.lastDiagnostics = latest;
        state.runtimeResult = diagnostics;
        recordAttachment(state, latest, reason);
        return latest;
      } catch (error) {
        const message = String(error?.message || error);
        if (/execution context|context was destroyed|target closed|inspected target|no session with given id|session closed|cannot find context/i.test(message)) {
          state.attached = false;
          state.runtimeResult = null;
          state.lastDiagnostics = null;
          return bootstrapSession(state, `${reason}:rebootstrap`);
        }
        throw error;
      } finally {
        state.refreshInFlight = null;
        state.refreshReasons = new Set();
      }
    })();

    return state.refreshInFlight;
  }

  async function attachTarget(targetInfo, stage) {
    if (!shouldAttachTarget(targetInfo)) return null;
    const existing = getActiveSessionState(targetInfo.targetId);
    if (existing) {
      existing.targetInfo = targetInfo;
      existing.realTarget = isRealDomUrl(targetInfo.url);
      return existing;
    }

    if (attachInFlight.has(targetInfo.targetId)) {
      return attachInFlight.get(targetInfo.targetId);
    }

    const pending = (async () => {
      let sessionId;
      try {
        ({ sessionId } = await send('Target.attachToTarget', { targetId: targetInfo.targetId, flatten: true }));
      } catch (error) {
        const message = String(error?.message || error);
        if (!/already attached|target.*attached/i.test(message)) {
          throw error;
        }

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline && !targetToSession.has(targetInfo.targetId)) {
          await sleep(100);
        }

        if (!targetToSession.has(targetInfo.targetId)) {
          throw error;
        }

        sessionId = targetToSession.get(targetInfo.targetId);
      }

      const state = activateSession(targetInfo, sessionId, stage);
      const diagnostics = await bootstrapSession(state, stage);
      state.history.push({ stage, diagnostics });
      return state;
    })()
      .finally(() => {
        attachInFlight.delete(targetInfo.targetId);
      });

    attachInFlight.set(targetInfo.targetId, pending);
    return pending;
  }

  on('Target.attachedToTarget', async ({ sessionId, targetInfo }) => {
    if (!shouldAttachTarget(targetInfo)) return;
    const state = activateSession(targetInfo, sessionId, 'Target.attachedToTarget');
    if (state.stale) return;
    const diagnostics = await bootstrapSession(state, 'Target.attachedToTarget');
    state.history.push({ stage: 'Target.attachedToTarget', diagnostics });
  });

  on('Target.detachedFromTarget', ({ sessionId, targetId }) => {
    const state = sessionStates.get(sessionId);
    if (state) {
      state.attached = false;
      state.detached = true;
      state.detachedAt = Date.now();
    }
    sessionStates.delete(sessionId);
    if (targetId) {
      const targetState = targetStates.get(targetId);
      if (targetState) {
        targetState.sessions.delete(sessionId);
        if (targetState.activeSessionId === sessionId) {
          targetState.activeSessionId = null;
          const fallback = [...targetState.sessions.values()]
            .filter((candidate) => !candidate.detached)
            .sort((a, b) => b.attachedSeq - a.attachedSeq)[0];
          if (fallback) {
            targetState.activeSessionId = fallback.sessionId;
            fallback.active = true;
            fallback.stale = false;
          }
        }
      }
      if (targetToSession.get(targetId) === sessionId) {
        targetToSession.delete(targetId);
      }
    }
  });

  on('Target.targetCreated', async ({ targetInfo }) => {
    if (!shouldAttachTarget(targetInfo)) return;
    await attachTarget(targetInfo, 'Target.targetCreated');
  });

  on('Target.targetInfoChanged', async ({ targetInfo }) => {
    const state = getActiveSessionState(targetInfo.targetId);
    if (!state) return;
    state.targetInfo = targetInfo;
    state.realTarget = isRealDomUrl(targetInfo.url);
    if (!state.attached) {
      await bootstrapSession(state, 'Target.targetInfoChanged');
      return;
    }
    await refreshSession(state, 'Target.targetInfoChanged');
  });

  await send('Target.setDiscoverTargets', { discover: true });
  await send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
    filter: [
      { type: 'page', exclude: false },
      { type: 'webview', exclude: false },
      { type: 'iframe', exclude: false },
      { type: 'worker', exclude: false },
      { type: 'service_worker', exclude: false }
    ]
  });

  await sleep(5000);

  const existing = await send('Target.getTargets');
  for (const targetInfo of existing.targetInfos) {
    if (!shouldAttachTarget(targetInfo)) continue;
    if (targetToSession.has(targetInfo.targetId)) continue;
    await attachTarget(targetInfo, 'Target.getTargets');
  }

  const attachedDeadline = Date.now() + 45000;
  while (Date.now() < attachedDeadline) {
    const activeRealStates = [...targetStates.values()]
      .map((targetState) => getActiveSessionState(targetState.targetId))
      .filter((state) => isActiveRealSession(state));
    if (activeRealStates.length > 0) break;
    await sleep(250);
  }

  const initialActiveRealStates = [...targetStates.values()]
    .map((targetState) => getActiveSessionState(targetState.targetId))
    .filter((state) => isActiveRealSession(state));

  if (initialActiveRealStates.length === 0) {
    throw new Error('No relevant targets were attached');
  }

  const bootstrapPromises = [];
  for (const state of initialActiveRealStates) {
    if (state.bootstrapInFlight) bootstrapPromises.push(state.bootstrapInFlight);
  }
  if (bootstrapPromises.length > 0) {
    await Promise.allSettled(bootstrapPromises);
  }

  const validationDeadline = Date.now() + 45000;
  while (Date.now() < validationDeadline) {
    const activeRealStates = [...targetStates.values()]
      .map((targetState) => getActiveSessionState(targetState.targetId))
      .filter((state) => isActiveRealSession(state));

    if (activeRealStates.length === 0) {
      await sleep(250);
      continue;
    }

    const refreshes = await Promise.allSettled(activeRealStates.map((state) => refreshSession(state, 'validation-poll')));
    if (refreshes.some((item) => item.status === 'rejected')) {
      await sleep(250);
      continue;
    }

    const ready = activeRealStates.every((state) => {
      const diagnostics = state.lastDiagnostics;
      return Boolean(
        diagnostics &&
        diagnostics.readyState &&
        diagnostics.readyState !== 'loading' &&
        diagnostics.composer &&
        diagnostics.composer.found &&
        diagnostics.style &&
        diagnostics.style.connected &&
        diagnostics.fonts &&
        diagnostics.fonts.check &&
        diagnostics.fonts.check['100'] === true &&
        diagnostics.fonts.check['400'] === true &&
        diagnostics.fonts.check['500'] === true &&
        diagnostics.fonts.check['600'] === true &&
        diagnostics.fonts.check['700'] === true &&
        diagnostics.fonts.check['900'] === true &&
        diagnostics.fonts.load &&
        diagnostics.fonts.load['100'] &&
        diagnostics.fonts.load['100'].ok === true &&
        diagnostics.fonts.load['400'] &&
        diagnostics.fonts.load['400'].ok === true &&
        diagnostics.fonts.load['500'] &&
        diagnostics.fonts.load['500'].ok === true &&
        diagnostics.fonts.load['600'] &&
        diagnostics.fonts.load['600'].ok === true &&
        diagnostics.fonts.load['700'] &&
        diagnostics.fonts.load['700'].ok === true &&
        diagnostics.fonts.load['900'] &&
        diagnostics.fonts.load['900'].ok === true &&
        Array.isArray(diagnostics.fonts.entries) &&
        diagnostics.fonts.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('100') && entry.status === 'loaded') &&
        diagnostics.fonts.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('400') && entry.status === 'loaded') &&
        diagnostics.fonts.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('500') && entry.status === 'loaded') &&
        diagnostics.fonts.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('600') && entry.status === 'loaded') &&
        diagnostics.fonts.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('700') && entry.status === 'loaded') &&
        diagnostics.fonts.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('900') && entry.status === 'loaded') &&
        diagnostics.fonts.canvas &&
        typeof diagnostics.fonts.canvas.delta === 'number' &&
        diagnostics.fonts.canvas.delta > 0
      );
    });

    if (ready) break;
    await sleep(250);
  }

  const settled = [...targetStates.values()]
    .map((targetState) => getActiveSessionState(targetState.targetId))
    .filter((state) => isActiveRealSession(state))
    .map((state) => ({
      targetId: state.targetId,
      type: state.targetInfo.type,
      url: state.targetInfo.url,
      title: state.targetInfo.title,
      sessionId: state.sessionId,
      runtimeInjectionResult: state.runtimeResult,
      styleInjectionResult: state.lastDiagnostics?.style ?? null,
      diagnostics: state.lastDiagnostics,
      bootstrapError: state.bootstrapError ?? null
    }));

  const proof = [];
  if (canaryMode) {
    for (const state of settled.map((item) => sessionStates.get(item.sessionId)).filter(Boolean)) {
      try {
        const diagnostics = await refreshSession(state, 'canary-proof');
        proof.push({
          targetId: state.targetId,
          sessionId: state.sessionId,
          url: state.targetInfo.url,
          outline: diagnostics?.composer?.outline ?? diagnostics?.proof?.outline ?? diagnostics?.style?.proofOutline ?? null,
          diagnostics
        });
      } catch (error) {
        proof.push({
          targetId: state.targetId,
          sessionId: state.sessionId,
          url: state.targetInfo.url,
          error: String(error)
        });
      }
    }
  }

  const failures = settled.filter((item) => {
    if (item.type !== 'page' && item.type !== 'webview' && item.type !== 'iframe') return false;
    if (!isRealDomUrl(item.url)) return false;
    return Boolean(
      item.bootstrapError ||
      !item.runtimeInjectionResult ||
      !item.styleInjectionResult ||
      item.styleInjectionResult.connected === false ||
      item.styleInjectionResult.hasSheet === false ||
      !item.diagnostics?.readyState ||
      item.diagnostics?.composer?.found !== true ||
      item.diagnostics?.fonts?.check?.['100'] !== true ||
      item.diagnostics?.fonts?.check?.['400'] !== true ||
      item.diagnostics?.fonts?.check?.['500'] !== true ||
      item.diagnostics?.fonts?.check?.['600'] !== true ||
      item.diagnostics?.fonts?.check?.['700'] !== true ||
      item.diagnostics?.fonts?.check?.['900'] !== true ||
      item.diagnostics?.fonts?.load?.['100']?.ok !== true ||
      item.diagnostics?.fonts?.load?.['400']?.ok !== true ||
      item.diagnostics?.fonts?.load?.['500']?.ok !== true ||
      item.diagnostics?.fonts?.load?.['600']?.ok !== true ||
      item.diagnostics?.fonts?.load?.['700']?.ok !== true ||
      item.diagnostics?.fonts?.load?.['900']?.ok !== true ||
      !Array.isArray(item.diagnostics?.fonts?.entries) ||
      !item.diagnostics?.fonts?.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('100') && entry.status === 'loaded') ||
      !item.diagnostics?.fonts?.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('400') && entry.status === 'loaded') ||
      !item.diagnostics?.fonts?.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('500') && entry.status === 'loaded') ||
      !item.diagnostics?.fonts?.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('600') && entry.status === 'loaded') ||
      !item.diagnostics?.fonts?.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('700') && entry.status === 'loaded') ||
      !item.diagnostics?.fonts?.entries.some((entry) => entry.family === 'Vazirmatn' && String(entry.weight).includes('900') && entry.status === 'loaded') ||
      typeof item.diagnostics?.fonts?.canvas?.delta !== 'number' ||
      item.diagnostics?.fonts?.canvas?.delta <= 0
    );
  });
  const payload = {
    mode: canaryMode ? 'canary' : 'rtl',
    port,
    fontValidation: validation,
    attachedTargets: settled.map(({ targetId, type, url, title, sessionId, runtimeInjectionResult, styleInjectionResult, diagnostics }) => ({
      targetId,
      type,
      url,
      title,
      sessionId,
      runtimeInjectionResult,
      styleInjectionResult,
      diagnostics
    })),
    proof: canaryMode ? proof : undefined,
    failures
  };

  log(JSON.stringify(payload, null, 2));

  if (settled.length === 0) {
    throw new Error('No targets attached');
  }

  if (failures.length > 0) {
    throw new Error(`Injection failed for ${failures.length} DOM target(s)`);
  }

  ws.close();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
