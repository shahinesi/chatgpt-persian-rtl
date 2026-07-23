#!/usr/bin/env node
/**
 * Diagnose the running RTL-enabled VS Code instance.
 *
 * Reports LaunchAgent status, heartbeat age, process health,
 * CDP reachability, Codex Webview discovery, runtime installation.
 * When service is loaded but unhealthy, includes launchctl print output.
 */
import { createHash } from 'node:crypto';
import {
  log, sleep, loadState, checkCDP, checkPid, PATCH_ID,
  LOG_FILE, RUNTIME_PATH, CSS_PATH, PROJECT_ROOT, DESKTOP_SHARED,
  SERVICE_LABEL, launchctlIsLoaded, launchctlPrint
} from './vscode-rtl-state.mjs';

function sha256Hex(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
  };
  ws.onclose = () => { for (const p of pending.values()) p.reject(new Error('closed')); pending.clear(); };
  function send(method, params = {}, sessionId = null) {
    const id = nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    ws.send(JSON.stringify(payload));
    return new Promise((r, j) => pending.set(id, { resolve: r, reject: j }));
  }
  return { ws, send };
}

async function evaluate(send, sessionId, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(`Eval: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

function sanitizeReportState(state) {
  if (!state) return null;
  const next = { ...state };
  const validatedTarget = state.validatedTarget || null;
  const runtime = state.runtime || null;
  const url = String(validatedTarget?.url || '');
  if (validatedTarget && (validatedTarget.type !== 'iframe' || !url.startsWith('vscode-webview:') || url.includes('/workbench/workbench.html'))) {
    next.validatedTarget = null;
  }
  if (runtime && (!runtime.installed || !runtime.styleConnected || runtime.visualApplied !== true)) {
    next.runtime = null;
  }
  return next;
}

async function main() {
  const state = loadState();
  if (!state) {
    throw new Error('No launched RTL VS Code instance found. Run rtl:launch first.');
  }
  const sanitizedState = sanitizeReportState(state);

  log(`State: mode=${state.mode}, profileMode=${state.profileMode || 'unknown'}, port=${state.port}, adapterPid=${state.adapterPid}, electronPid=${state.electronPid}`);

  const report = {
    stateFile: 'present',
    mode: state.mode,
    profileMode: state.profileMode || null,
    port: state.port,
    adapterPid: state.adapterPid,
    electronPid: state.electronPid,
    serviceLabel: state.serviceLabel || null,
    plistPath: state.plistPath || null,
    executablePath: state.executablePath,
    appPath: state.appPath,
    logFile: state.logFile || null,
    runtimeSourceHash: state.runtimeSourceHash,
    cssSourceHash: state.cssSourceHash,
    createdAt: state.createdAt,
    lastUpdatedAt: state.lastUpdatedAt,
    lastHeartbeatAt: state.lastHeartbeatAt || null,
    processHealth: {},
    launchdHealth: null,
    heartbeatHealth: null,
    cdpHealth: null,
    validatedTarget: sanitizedState.validatedTarget || null,
    runtime: sanitizedState.runtime || null
  };

  // 1. LaunchAgent health
  const serviceLoaded = launchctlIsLoaded();
  report.launchdHealth = { loaded: serviceLoaded, label: SERVICE_LABEL };
  log(`LaunchAgent loaded: ${serviceLoaded ? 'yes' : 'no'}`);
  log(`Service label: ${SERVICE_LABEL}`);

  // 2. Process health (informational)
  const adapterCheck = checkPid(state.adapterPid);
  report.processHealth.adapter = adapterCheck;
  log(`Adapter PID ${state.adapterPid}: ${adapterCheck.alive ? adapterCheck.comm : 'not running'}`);

  const electronCheck = checkPid(state.electronPid);
  report.processHealth.electron = electronCheck;
  log(`Electron PID ${state.electronPid}: ${electronCheck.alive ? electronCheck.comm : 'not running'}`);

  // 3. Heartbeat age
  if (state.lastHeartbeatAt) {
    const heartbeatAge = Date.now() - new Date(state.lastHeartbeatAt).getTime();
    const heartbeatAgeSec = Math.round(heartbeatAge / 1000);
    const stale = heartbeatAge > 30000;
    report.heartbeatHealth = { lastAt: state.lastHeartbeatAt, ageSeconds: heartbeatAgeSec, stale };
    log(`Heartbeat: ${heartbeatAgeSec}s ago${stale ? ' (STALE)' : ' (fresh)'}`);
  } else {
    report.heartbeatHealth = { lastAt: null, ageSeconds: null, stale: true };
    log('Heartbeat: never recorded (STALE)');
  }

  // 4. CDP health — primary indicator of liveness
  const cdpInfo = await checkCDP(state.port, 3000);
  if (!cdpInfo) {
    report.cdpHealth = { reachable: false, port: state.port };
    log(`CDP port ${state.port}: NOT reachable`);
    log('\nCDP not reachable. VS Code may have exited or restarted on a different port.');

    // If service is loaded but unhealthy, include launchctl output
    if (serviceLoaded) {
      log('\n--- launchctl print output ---');
      const printResult = launchctlPrint();
      log(printResult.output);
      log('--- end launchctl print ---');
    }

    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.cdpHealth = { reachable: true, browser: cdpInfo.Browser, port: state.port, webSocketDebuggerUrl: cdpInfo.webSocketDebuggerUrl };
  log(`CDP reachable: ${cdpInfo.Browser}`);

  // 5. Connect and report targets
  const { ws, send } = await cdpConnect(cdpInfo.webSocketDebuggerUrl);
  const { targetInfos } = await send('Target.getTargets');
  log(`CDP targets: ${targetInfos.length}`);
  report.totalTargets = targetInfos.length;

  report.candidateTargets = targetInfos.filter(t => (t.type === 'webview' || t.type === 'iframe' || t.type === 'page') && t.url && !t.url.includes('devtools://')).length;

  console.log(JSON.stringify(report, null, 2));

  ws.close();

  // Non-fatal warnings (exit 0) when Codex panel not yet visible
  if (!report.validatedTarget) {
    log('\nWARNING: No validated Codex Webview found. Open the Codex panel in VS Code.');
  }
  if (!report.runtime?.installed) {
    log('\nWARNING: Runtime not installed in validated target.');
  } else if (!report.runtime?.visualApplied) {
    log('\nWARNING: Runtime exists, but no visible font/direction effect was verified.');
  }
  if (report.runtime?.installed && !report.runtime?.fontApplied) {
    log('\nWARNING: Vazirmatn is not applied to visible Codex text.');
  }
  if (report.runtime?.installed && !report.runtime?.rtlApplied) {
    log('\nWARNING: No visible RTL element was verified in the Codex Webview.');
  }

  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`FATAL: ${error.stack || error.message}\n`);
  process.exit(1);
});
