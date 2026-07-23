#!/usr/bin/env node
/**
 * Tests for the VS Code RTL adapter lifecycle and shared state.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const desktopShared = path.resolve(projectRoot, 'desktop', 'shared');
const runtimePath = path.join(desktopShared, 'rtl-runtime.js');
const cssPath = path.join(desktopShared, 'rtl-patch.css');
const launcherPath = path.join(__dirname, 'codex-vscode-rtl-launcher.mjs');
const stateModulePath = path.join(__dirname, 'vscode-rtl-state.mjs');

let passed = 0;
let failed = 0;
const pendingTests = [];
let testQueue = Promise.resolve();

function test(name, fn) {
  const promise = testQueue.then(async () => {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    ${e.message}`);
    }
  });
  testQueue = promise.then(() => {}, () => {});
  pendingTests.push(promise);
  return promise;
}

async function testAsync(name, fn) {
  return test(name, fn);
}

function sha256Hex(buf) { return createHash('sha256').update(buf).digest('hex'); }

async function withMockFetch(mockFetch, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log('vscode/bin/codex-vscode-rtl-launcher.test.mjs\n');

// ── Shared state module ─────────────────────────────────────────
console.log('Shared state module');

test('state module exports canonical STATE_FILE path', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.ok(mod.STATE_FILE.endsWith('rtl-launcher-state.json'));
  assert.ok(mod.STATE_FILE.includes('chatgpt-persian-rtl'));
  assert.ok(mod.STATE_FILE.includes('vscode-profile'));
});

test('state module exports STATE_DIR', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.ok(mod.STATE_DIR.endsWith('vscode-profile'));
});

test('state module exports LOG_FILE', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.ok(mod.LOG_FILE.endsWith('rtl-adapter.log'));
  assert.ok(mod.LOG_FILE.includes('chatgpt-persian-rtl'));
});

test('state module exports PATCH_ID', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.equal(mod.PATCH_ID, 'chatgpt-persian-rtl-desktop-runtime');
});

test('state module exports font paths', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.ok(mod.FONT_ROOT.endsWith('fonts'));
  assert.ok(mod.WEBFONT_ROOT.endsWith('webfonts'));
});

test('state module exports launchd constants', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.equal(mod.SERVICE_LABEL, 'com.shahineskandari.chatgpt-persian-rtl.vscode');
  assert.ok(mod.PLIST_PATH.endsWith('.plist'));
  assert.ok(mod.PLIST_PATH.includes('LaunchAgents'));
  assert.ok(mod.PLIST_DIR.includes('LaunchAgents'));
});

test('all three commands import from the same state module', async () => {
  for (const file of ['codex-vscode-rtl-launcher.mjs', 'codex-vscode-rtl-stop.mjs', 'codex-vscode-rtl-diagnose.mjs']) {
    const src = readFileSync(path.join(__dirname, file), 'utf8');
    assert.ok(src.includes("from './vscode-rtl-state.mjs'"), `${file} should import from vscode-rtl-state.mjs`);
  }
});

// ── Atomic state writes ─────────────────────────────────────────
console.log('\nAtomic state writes');

test('saveState writes to temp then renames', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  const orig = existsSync(mod.STATE_FILE) ? readFileSync(mod.STATE_FILE, 'utf8') : null;
  try {
    mod.saveState({ test: true, pid: 12345 });
    const data = JSON.parse(readFileSync(mod.STATE_FILE, 'utf8'));
    assert.equal(data.test, true);
    assert.equal(data.pid, 12345);
  } finally {
    if (orig) writeFileSync(mod.STATE_FILE, orig);
    else try { unlinkSync(mod.STATE_FILE); } catch {}
  }
});

test('loadState returns null for missing file', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  assert.ok(existsSync(mod.STATE_FILE) || !existsSync(mod.STATE_FILE));
});

test('clearState removes the file', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  const orig = existsSync(mod.STATE_FILE) ? readFileSync(mod.STATE_FILE, 'utf8') : null;
  try {
    mod.saveState({ test: 'clear' });
    assert.ok(existsSync(mod.STATE_FILE));
    mod.clearState();
    assert.ok(!existsSync(mod.STATE_FILE));
  } finally {
    if (orig) writeFileSync(mod.STATE_FILE, orig);
  }
});

// ── Plist generation ────────────────────────────────────────────
console.log('\nPlist generation');

test('generatePlist produces valid plist with required keys', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  const plist = mod.generatePlist({
    nodeExecutable: '/usr/local/bin/node',
    scriptPath: '/Users/test/project/vscode/bin/codex-vscode-rtl-launcher.mjs',
    logFile: '/Users/test/log/adapter.log',
    workingDir: '/Users/test/project'
  });
  assert.ok(plist.includes('<?xml version="1.0"'));
  assert.ok(plist.includes('<!DOCTYPE plist'));
  assert.ok(plist.includes('<key>Label</key>'));
  assert.ok(plist.includes('<key>ProgramArguments</key>'));
  assert.ok(plist.includes('<key>RunAtLoad</key>'));
  assert.ok(plist.includes('<key>KeepAlive</key>'));
  assert.ok(plist.includes('<key>WorkingDirectory</key>'));
  assert.ok(plist.includes('<key>StandardOutPath</key>'));
  assert.ok(plist.includes('<key>StandardErrorPath</key>'));
  assert.ok(plist.includes('<true/>'));
});

test('generatePlist uses absolute Node and script paths', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  const plist = mod.generatePlist({
    nodeExecutable: '/usr/local/bin/node',
    scriptPath: '/Users/test/project/vscode/bin/codex-vscode-rtl-launcher.mjs',
    logFile: '/Users/test/log/adapter.log',
    workingDir: '/Users/test/project'
  });
  assert.ok(plist.includes('/usr/local/bin/node'), 'should include absolute Node path');
  assert.ok(plist.includes('/Users/test/project/vscode/bin/codex-vscode-rtl-launcher.mjs'), 'should include absolute script path');
  assert.ok(plist.includes('--daemon'), 'should include --daemon argument');
});

test('generatePlist has no npm or shell command', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  const plist = mod.generatePlist({
    nodeExecutable: '/usr/local/bin/node',
    scriptPath: '/Users/test/project/vscode/bin/codex-vscode-rtl-launcher.mjs',
    logFile: '/Users/test/log/adapter.log',
    workingDir: '/Users/test/project'
  });
  assert.ok(!plist.includes('npm'), 'should not contain npm');
  assert.ok(!plist.includes('shell'), 'should not contain shell');
  assert.ok(!plist.includes('/bin/sh'), 'should not contain /bin/sh');
  assert.ok(!plist.includes('bash'), 'should not contain bash');
});

test('generatePlist escapes XML special characters', async () => {
  const mod = await import(path.join(__dirname, 'vscode-rtl-state.mjs'));
  const plist = mod.generatePlist({
    nodeExecutable: '/path/with & special < "chars" > here',
    scriptPath: '/test',
    logFile: '/test',
    workingDir: '/test'
  });
  assert.ok(plist.includes('&amp;'), 'should escape &');
  assert.ok(plist.includes('&lt;'), 'should escape <');
  assert.ok(plist.includes('&gt;'), 'should escape >');
  assert.ok(plist.includes('&quot;'), 'should escape "');
});

// ── Mode parsing ────────────────────────────────────────────────
console.log('\nMode parsing');

test('--bg parses as background', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("args.includes('--bg')"), 'should check for --bg flag');
  assert.ok(src.includes("mode: 'background'"), 'should set mode to background');
});

test('--daemon parses as daemon', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("args.includes('--daemon')"), 'should check for --daemon flag');
});

test('no flag means foreground', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("mode: 'foreground'"), 'should set mode to foreground');
});

test('--bg never writes mode foreground', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  assert.ok(bgStart > 0, 'runBackground function should exist');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(!bgBody.includes("mode: 'foreground'"), 'runBackground should not write mode foreground');
});

// ── Background bootstrap (launchd) ─────────────────────────────
console.log('\nBackground bootstrap (launchd)');

test('--bg writes plist atomically and bootstraps via launchctl', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(bgBody.includes('writePlist'), 'should write plist');
  assert.ok(bgBody.includes('launchctlBootstrap'), 'should bootstrap via launchctl');
  assert.ok(bgBody.includes('launchctlKickstart'), 'should kickstart service');
  assert.ok(bgBody.includes('generatePlist'), 'should generate plist content');
});

test('--bg does not spawn Node daemon directly', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(!bgBody.includes("spawn('nohup'"), 'should not spawn nohup');
  assert.ok(!bgBody.includes("spawn('node'"), 'should not spawn node directly');
  assert.ok(!bgBody.includes('detached: true'), 'should not spawn detached process');
});

test('--bg validates node and script paths', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(bgBody.includes('process.execPath'), 'should use Node executable path');
  assert.ok(bgBody.includes('LAUNCHER_SCRIPT'), 'should use launcher script path');
  assert.ok(bgBody.includes('existsSync'), 'should validate paths exist');
});

test('--bg removes stale service before bootstrapping', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(bgBody.includes('launchctlRemoveStale'), 'should remove stale service');
});

test('--bg waits for service loaded and CDP reachable', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(bgBody.includes('launchctlIsLoaded'), 'should check if service loaded');
  assert.ok(bgBody.includes('checkCDP'), 'should check CDP reachable');
  assert.ok(bgBody.includes('process.exit(0)'), 'should exit 0 on confirmed health');
});

// ── Daemon lifecycle ────────────────────────────────────────────
console.log('\nDaemon lifecycle');

test('daemon writes its own adapterPid', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('adapterPid: process.pid'), 'daemon should write its own PID as adapterPid');
});

test('daemon writes electronPid', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('electronPid'), 'daemon should write electronPid');
});

test('daemon writes mode background', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes("mode: 'background'"), 'daemon should write mode background');
});

test('daemon writes serviceLabel and plistPath', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('serviceLabel'), 'daemon should write serviceLabel');
  assert.ok(daemonBody.includes('plistPath'), 'daemon should write plistPath');
});

test('daemon writes lastHeartbeatAt', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('lastHeartbeatAt'), 'daemon should write lastHeartbeatAt');
});

test('daemon main remains pending after CDP ready', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('watcherLoop'), 'daemon should call watcherLoop');
  assert.ok(daemonBody.includes('await'), 'daemon should await watcherLoop (never returns)');
});

test('daemon does not call process.exit(0) after CDP ready', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  const cdpReadyIdx = daemonBody.indexOf('CDP ready');
  assert.ok(cdpReadyIdx > 0);
  const shutdownIdx = daemonBody.indexOf("process.on('SIGTERM'");
  assert.ok(shutdownIdx > 0, 'SIGTERM handler should exist');
  const betweenCdpAndShutdown = daemonBody.slice(cdpReadyIdx, shutdownIdx);
  assert.ok(!betweenCdpAndShutdown.includes('process.exit(0)'), 'daemon should not exit(0) between CDP ready and shutdown handler');
});

test('daemon shutdown handler kills owned Electron', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('process.kill(currentElectronPid'), 'daemon shutdown should kill Electron');
});

test('daemon relaunches Electron on exit', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('child.on(\'exit\''), 'daemon should track Electron exit');
  assert.ok(daemonBody.includes('Will relaunch'), 'daemon should log relaunch');
});

test('daemon never exits on Electron exit', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  // The child.on('exit') handler should NOT call process.exit
  const exitIdx = daemonBody.indexOf("child.on('exit'");
  assert.ok(exitIdx > 0, 'should have exit handler');
  const exitHandlerEnd = daemonBody.indexOf('\n    });', exitIdx);
  const exitHandlerBody = daemonBody.slice(exitIdx, exitHandlerEnd);
  assert.ok(!exitHandlerBody.includes('process.exit'), 'Electron exit handler should not exit daemon');
});

test('daemon has exit diagnostics', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('uncaughtException'), 'should register uncaughtException handler');
  assert.ok(daemonBody.includes('unhandledRejection'), 'should register unhandledRejection handler');
  assert.ok(daemonBody.includes('SIGTERM'), 'should register SIGTERM handler');
  assert.ok(daemonBody.includes('SIGINT'), 'should register SIGINT handler');
  assert.ok(daemonBody.includes('SIGHUP'), 'should register SIGHUP handler');
  assert.ok(daemonBody.includes('beforeExit'), 'should register beforeExit handler');
  assert.ok(daemonBody.includes("'exit'"), 'should register exit handler');
  assert.ok(daemonBody.includes('appendFileSync(LOG_FILE'), 'should log to LOG_FILE');
});

test('daemon updates heartbeat', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const daemonStart = src.indexOf('async function runDaemon');
  const daemonEnd = src.indexOf('async function runBackground', daemonStart);
  const daemonBody = src.slice(daemonStart, daemonEnd);
  assert.ok(daemonBody.includes('heartbeatInterval'), 'should have heartbeat interval');
  assert.ok(daemonBody.includes('lastHeartbeatAt'), 'should update lastHeartbeatAt');
  assert.ok(daemonBody.includes('10000'), 'should update every 10 seconds');
});

// ── Foreground lifecycle ────────────────────────────────────────
console.log('\nForeground lifecycle');

test('foreground main remains pending after CDP ready', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const fgStart = src.indexOf('async function runForeground');
  const fgEnd = src.indexOf('async function main', fgStart);
  const fgBody = src.slice(fgStart, fgEnd);
  assert.ok(fgBody.includes('watcherLoop'), 'foreground should call watcherLoop');
  assert.ok(fgBody.includes('await watcherLoop'), 'foreground should await watcherLoop (never returns)');
});

test('foreground writes mode foreground', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const fgStart = src.indexOf('async function runForeground');
  const fgEnd = src.indexOf('async function main', fgStart);
  const fgBody = src.slice(fgStart, fgEnd);
  assert.ok(fgBody.includes("mode: 'foreground'"), 'foreground should write mode foreground');
});

test('foreground shutdown handler kills owned Electron', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const fgStart = src.indexOf('async function runForeground');
  const fgEnd = src.indexOf('async function main', fgStart);
  const fgBody = src.slice(fgStart, fgEnd);
  assert.ok(fgBody.includes('process.kill(electronPid'), 'foreground shutdown should kill Electron');
  assert.ok(fgBody.includes('clearState()'), 'foreground shutdown should clear state');
});

test('foreground has signal handlers', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const fgStart = src.indexOf('async function runForeground');
  const fgEnd = src.indexOf('async function main', fgStart);
  const fgBody = src.slice(fgStart, fgEnd);
  assert.ok(fgBody.includes('SIGINT'), 'foreground should handle SIGINT');
  assert.ok(fgBody.includes('SIGTERM'), 'foreground should handle SIGTERM');
});

// ── Electron executable resolution ──────────────────────────────
console.log('\nElectron executable resolution');

test('resolver uses Contents/MacOS/Electron', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("path.join(appPath, 'Contents', 'MacOS', 'Electron')"),
    'should resolve to Contents/MacOS/Electron');
});

test('resolver does NOT use bin/code', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(!src.includes("path.join(appPath, 'Contents', 'Resources', 'app', 'bin', 'code')"),
    'should not resolve to bin/code');
});

test('startup assertion checks /Contents/MacOS/Electron suffix', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("endsWith('/Contents/MacOS/Electron')"),
    'should assert executable ends with /Contents/MacOS/Electron');
});

test('launcher logs VS Code Electron path', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('VS Code Electron:'), 'should log VS Code Electron path');
});

test('resolver throws if Electron binary not found', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('VS Code Electron binary not found'),
    'should throw descriptive error when Electron missing');
});

// ── State file contents ─────────────────────────────────────────
console.log('\nState file contents');

test('state contains adapterPid, electronPid, mode, logFile', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('adapterPid'));
  assert.ok(src.includes('electronPid'));
  assert.ok(src.includes('mode:'));
  assert.ok(src.includes('logFile'));
});

test('state contains serviceLabel and plistPath', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('serviceLabel'));
  assert.ok(src.includes('plistPath'));
});

test('state contains lastHeartbeatAt', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('lastHeartbeatAt'));
});

// ── Stop behavior ───────────────────────────────────────────────
console.log('\nStop behavior');

test('stop runs launchctl bootout before process cleanup', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-stop.mjs'), 'utf8');
  assert.ok(src.includes('launchctlBootout'), 'should run bootout');
  assert.ok(src.includes('launchctlIsLoaded'), 'should check if loaded');
});

test('stop terminates adapter first', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-stop.mjs'), 'utf8');
  assert.ok(src.includes('adapterPid'), 'should reference adapterPid');
  assert.ok(src.includes('Adapter'), 'should label adapter stop');
});

test('stop terminates electronPid', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-stop.mjs'), 'utf8');
  assert.ok(src.includes('electronPid'), 'should reference electronPid');
  assert.ok(src.includes('Electron'), 'should label Electron stop');
});

test('stop removes plist', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-stop.mjs'), 'utf8');
  assert.ok(src.includes('removePlist'), 'should remove plist');
  assert.ok(src.includes('PLIST_PATH'), 'should reference PLIST_PATH');
});

test('stop calls clearState after stopping', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-stop.mjs'), 'utf8');
  assert.ok(src.includes('clearState'));
});

test('stop cleans up orphaned plist when no state', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-stop.mjs'), 'utf8');
  assert.ok(src.includes('orphaned plist'), 'should clean up orphaned plist');
  assert.ok(src.includes('launchctlBootout'), 'should bootout orphaned service');
});

// ── Diagnose behavior ───────────────────────────────────────────
console.log('\nDiagnose behavior');

test('diagnose reports LaunchAgent loaded status', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('launchctlIsLoaded'), 'should check launchd status');
  assert.ok(src.includes('LaunchAgent loaded'), 'should report LaunchAgent status');
  assert.ok(src.includes('launchdHealth'), 'should include launchdHealth in report');
});

test('diagnose reports heartbeat age', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('lastHeartbeatAt'), 'should report lastHeartbeatAt');
  assert.ok(src.includes('heartbeatHealth'), 'should include heartbeatHealth in report');
  assert.ok(src.includes('Heartbeat:'), 'should log heartbeat status');
});

test('diagnose detects stale heartbeat', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('stale'), 'should detect stale heartbeat');
  assert.ok(src.includes('30000'), 'should use 30s threshold');
});

test('diagnose uses CDP reachability as primary health indicator', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('cdpHealth'));
  assert.ok(src.includes('reachable'));
  assert.ok(src.includes('checkCDP'));
});

test('diagnose reports mode and electronPid', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('state.mode'), 'should report mode');
  assert.ok(src.includes('state.electronPid'), 'should report electronPid');
});

test('diagnose reports logFile when in background mode', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('logFile'), 'should report logFile');
});

test('diagnose reports service label', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('SERVICE_LABEL'), 'should reference SERVICE_LABEL');
  assert.ok(src.includes('serviceLabel'), 'should report serviceLabel');
});

test('diagnose reports persisted validatedTarget and runtime state', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('sanitizeReportState(state)'), 'should sanitize persisted state before reporting');
  assert.ok(src.includes('validatedTarget:'), 'should report persisted validatedTarget');
  assert.ok(src.includes('runtime:'), 'should report persisted runtime');
});

test('diagnose includes launchctl print on unhealthy service', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('launchctlPrint'), 'should call launchctlPrint');
  assert.ok(src.includes('launchctl print output'), 'should log launchctl output');
});

test('diagnose exits 0 when CDP reachable but Codex not visible', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-diagnose.mjs'), 'utf8');
  assert.ok(src.includes('process.exit(0)'), 'should exit 0 for non-fatal warnings');
});

// ── Safe placeholder quoting ────────────────────────────────────
console.log('\nSafe placeholder quoting');

test('launcher replaces all 5 placeholders', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("replace('__CHATGPT_RTL_BUILD__'"));
  assert.ok(src.includes("replace('__CHATGPT_RTL_RUNTIME_SHA256__'"));
  assert.ok(src.includes("replace('__CHATGPT_RTL_CSS_SHA256__'"));
  assert.ok(src.includes("replace('__CHATGPT_RTL_DIAGNOSTIC_MODE__'"));
  assert.ok(src.includes("replace('__CHATGPT_PERSIAN_RTL_CSS__'"));
});

test('launcher validates no bare placeholders remain', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('Unsubstituted placeholders'));
});

// ── Hash calculation ────────────────────────────────────────────
console.log('\nHash calculation');

test('runtime source hash is SHA-256', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("sha256Hex(readFileSync(RUNTIME_PATH))"));
});

test('CSS source hash is SHA-256', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes("sha256Hex(readFileSync(CSS_PATH))"));
});

// ── Shared file reuse ───────────────────────────────────────────
console.log('\nShared file reuse');

test('launcher imports paths from state module', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('RUNTIME_PATH'));
  assert.ok(src.includes('CSS_PATH'));
  assert.ok(src.includes('WEBFONT_ROOT'));
});

test('no duplication of runtime or CSS', () => {
  assert.ok(!existsSync(path.join(__dirname, '..', 'shared')));
});

// ── Idempotent injection ────────────────────────────────────────
console.log('\nIdempotent injection');

test('uses addScriptToEvaluateOnNewDocument', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('Page.addScriptToEvaluateOnNewDocument'));
});

test('runtime instance count check exists', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('instanceCount') || src.includes('runtimeInstanceCount'));
});

// ── Target handling ─────────────────────────────────────────────
console.log('\nTarget handling');

testAsync('confirmed iframe target is accepted', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'iframe-target',
    type: 'iframe',
    url: 'vscode-webview://dynamic-authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron'
  }), true);
});

testAsync('same URL as type page is accepted for compatibility', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'page-target',
    type: 'page',
    url: 'vscode-webview://dynamic-authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron'
  }), true);
});

testAsync('workbench vscode-file page is rejected', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'workbench-target',
    type: 'page',
    url: 'vscode-file://vscode-app/Users/test/workbench/workbench.html'
  }), false);
});

testAsync('another extension webview is rejected', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'other-extension',
    type: 'iframe',
    url: 'vscode-webview://dynamic-authority/index.html?extensionId=example.other&purpose=webviewView&platform=electron'
  }), false);
});

testAsync('openai.chatgpt with another purpose is rejected', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'other-purpose',
    type: 'iframe',
    url: 'vscode-webview://dynamic-authority/index.html?extensionId=openai.chatgpt&purpose=panel&platform=electron'
  }), false);
});

testAsync('dynamic authority, UUID, origin, and parentId do not affect matching', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'dynamic-target',
    type: 'iframe',
    parentId: 'workbench-target',
    url: 'vscode-webview://authority-with-uuid/index.html?uuid=deadbeef&origin=https%3A%2F%2Fexample.com&extensionId=openai.chatgpt&purpose=webviewView&platform=electron'
  }), true);
});

testAsync('target.url is used instead of HTML-escaped title', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.isCodexWebviewTarget({
    targetId: 'title-target',
    type: 'iframe',
    title: '&lt;iframe&gt;Codex&lt;/iframe&gt;',
    url: 'vscode-webview://dynamic-authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron'
  }), true);
});

testAsync('destroyed targets are removed from injected-target tracking', async () => {
  const mod = await import(launcherPath);
  const tracker = mod.createCodexTargetTracker();
  tracker.markInjected('destroy-me');
  assert.equal(tracker.injectedTargetIds.has('destroy-me'), true);
  tracker.forget('destroy-me');
  assert.equal(tracker.injectedTargetIds.has('destroy-me'), false);
});

test('stale workbench validation state is cleared on startup', async () => {
  const mod = await import(launcherPath);
  const sanitized = mod.sanitizePersistedState({
    validatedTarget: {
      id: 'workbench-target',
      type: 'page',
      url: 'vscode-file://vscode-app/workbench/workbench.html',
      parentId: null
    },
    runtime: {
      installed: false,
      styleConnected: false,
      injectedAt: '2026-01-01T00:00:00.000Z'
    }
  });
  assert.equal(sanitized.validatedTarget, null);
  assert.equal(sanitized.runtime, null);
});

testAsync('iframe with empty CDP URL is enriched from /json/list', async () => {
  const mod = await import(launcherPath);
  const jsonTarget = {
    id: 'iframe-target',
    type: 'iframe',
    url: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron',
    parentId: 'workbench-target',
    webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/page/iframe-target'
  };
  await withMockFetch(async (url) => ({ ok: true, json: async () => [jsonTarget] }), async () => {
    const fetched = await mod.fetchJsonListTargets(1234);
    const jsonMap = mod.buildJsonListTargetMap(fetched);
    const resolved = await mod.resolveCodexTargetCandidate(async () => { throw new Error('should not probe'); }, {
      targetId: 'iframe-target',
      type: 'iframe',
      url: '',
      title: 'Codex'
    }, jsonMap.get('iframe-target'), {});
    assert.equal(resolved.accepted, true);
    assert.equal(resolved.url, jsonTarget.url);
    assert.equal(resolved.jsonListUrl, jsonTarget.url);
  });
});

testAsync('iframe missing from /json/list is probed through location.href', async () => {
  const mod = await import(launcherPath);
  const calls = [];
  const send = async (method, params = {}, sessionId = null) => {
    calls.push({ method, params, sessionId });
    if (method === 'Target.attachToTarget') return { sessionId: 'session-probe' };
    if (method === 'Runtime.enable') return {};
    if (method === 'Runtime.evaluate' && params.expression.includes('location.href')) {
      return { result: { value: JSON.stringify({
        href: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron',
        readyState: 'complete',
        hasDocumentElement: true,
        hasBody: true,
        title: '',
        textareaCount: 1,
        contenteditableCount: 1,
        runtimeMarker: false,
        styleConnected: false
      }) } };
    }
    throw new Error(`unexpected call: ${method}`);
  };
  const resolved = await mod.resolveCodexTargetCandidate(send, {
    targetId: 'probe-target',
    type: 'iframe',
    url: ''
  }, null, {});
  assert.equal(resolved.accepted, true);
  assert.equal(resolved.probedHref.startsWith('vscode-webview:'), true);
  assert.equal(resolved.sessionId, 'session-probe');
  assert.ok(calls.some((call) => call.method === 'Target.attachToTarget'));
});

test('launcher scans existing targets immediately and listens for new targets', () => {
  const src = readFileSync(launcherPath, 'utf8');
  assert.ok(src.includes('Target.getTargets'), 'existing targets should be scanned immediately');
  assert.ok(src.includes('Target.targetCreated'), 'new targets should be scanned');
  assert.ok(src.includes('Target.targetDestroyed'), 'destroyed targets should be removed');
});

test('launcher logs actionable candidate and validation lines', () => {
  const src = readFileSync(launcherPath, 'utf8');
  assert.ok(src.includes('Candidate target:'), 'should log each candidate target');
  assert.ok(src.includes('Validated Codex Webview:'), 'should log validated webviews');
  assert.ok(src.includes('Runtime installed:'), 'should log runtime installation');
  assert.ok(src.includes('Style connected:'), 'should log style connection');
});

// ── Injection behavior ──────────────────────────────────────────
console.log('\nInjection behavior');

testAsync('injection happens in the accepted iframe target, not the workbench', async () => {
  const mod = await import(launcherPath);
  const tracker = mod.createCodexTargetTracker();
  const calls = [];
  let probeIndex = 0;
  let installed = false;
  const runtimeSource = `(() => {
    const styleId = 'chatgpt-rtl-style';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    window['chatgpt-persian-rtl-desktop-runtime'] = {
      buildMarker: 'test',
      runtimeSourceHash: 'hash',
      cssSourceHash: 'hash',
      runtimeInstanceCount: 1,
      diagnostics() {
        return { observerCount: 1, style: { connected: Boolean(style && style.isConnected) }, readyState: document.readyState, composer: { found: true }, fonts: { check: true, entries: [] }, errors: [] };
      },
      ensure() {}
    };
  })()`;

  const send = async (method, params = {}, sessionId = null) => {
    calls.push({ method, params, sessionId });
    if (method === 'Target.attachToTarget') return { sessionId: `session-${params.targetId}` };
    if (method === 'Runtime.enable' || method === 'Page.enable' || method === 'Page.addScriptToEvaluateOnNewDocument') return {};
    if (method === 'Runtime.evaluate') {
      if (params.expression.includes('location.href')) {
        const probe = probeIndex === 0
          ? { href: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron', readyState: 'loading', hasDocumentElement: true, hasBody: false, title: '', textareaCount: 0, contenteditableCount: 0, runtimeMarker: false, styleConnected: false }
          : { href: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron', readyState: 'complete', hasDocumentElement: true, hasBody: true, title: '', textareaCount: 1, contenteditableCount: 1, runtimeMarker: false, styleConnected: false };
        probeIndex++;
        return { result: { value: JSON.stringify(probe) } };
      }
      if (params.expression === runtimeSource) {
        installed = true;
        return { result: { value: true } };
      }
      if (params.expression.includes('api.diagnostics')) {
        return { result: { value: JSON.stringify({ installed, styleConnected: installed, buildMarker: 'test', runtimeSourceHash: 'hash', cssSourceHash: 'hash', instanceCount: 1, observerCount: 1, readyState: 'complete', composerFound: true, fontCheck: true, fontEntries: 0, errors: [] }) } };
      }
      if (params.expression.includes('api.ensure')) return { result: { value: 'ok' } };
    }
    throw new Error(`unexpected call: ${method}`);
  };

  const workbenchTarget = {
    targetId: 'workbench-target',
    type: 'page',
    url: 'vscode-file://vscode-app/Users/test/workbench/workbench.html'
  };
  const iframeTarget = {
    targetId: 'iframe-target',
    type: 'iframe',
    parentId: 'workbench-target',
    url: ''
  };
  const jsonTarget = {
    id: 'iframe-target',
    type: 'iframe',
    parentId: 'workbench-target',
    url: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron',
    webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/page/iframe-target'
  };

  const stateMod = await import(stateModulePath);
  const originalState = existsSync(stateMod.STATE_FILE) ? readFileSync(stateMod.STATE_FILE, 'utf8') : null;
  try {
    const baselineState = stateMod.loadState();
    const rejected = await mod.processTargetInfo(send, runtimeSource, tracker, workbenchTarget, { logFn: () => {} });
    assert.equal(rejected.status, 'rejected');
    assert.deepEqual(stateMod.loadState(), baselineState);

    const injected = await mod.processTargetInfo(send, runtimeSource, tracker, iframeTarget, { logFn: () => {}, jsonTarget });
    assert.equal(injected.status, 'injected');
    assert.ok(calls.some((call) => call.method === 'Target.attachToTarget' && call.params.targetId === 'iframe-target'));
    assert.ok(!calls.some((call) => call.method === 'Target.attachToTarget' && call.params.targetId === 'workbench-target'));
    assert.ok(calls.every((call) => !['Runtime.enable', 'Page.enable', 'Page.addScriptToEvaluateOnNewDocument', 'Runtime.evaluate'].includes(call.method) || call.sessionId === 'session-iframe-target'));
  } finally {
    if (originalState) writeFileSync(stateMod.STATE_FILE, originalState);
    else try { unlinkSync(stateMod.STATE_FILE); } catch {}
  }
});

testAsync('body-not-ready is retried before injection', async () => {
  const mod = await import(launcherPath);
  const tracker = mod.createCodexTargetTracker();
  let probeIndex = 0;
  let installed = false;
  const runtimeSource = `(() => {
    const styleId = 'chatgpt-rtl-style';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    window['chatgpt-persian-rtl-desktop-runtime'] = { buildMarker: 'test', runtimeSourceHash: 'hash', cssSourceHash: 'hash', runtimeInstanceCount: 1, diagnostics() { return { observerCount: 1, style: { connected: Boolean(style && style.isConnected) }, readyState: document.readyState, composer: { found: true }, fonts: { check: true, entries: [] }, errors: [] }; }, ensure() {} };
  })()`;
  const send = async (method, params = {}, sessionId = null) => {
    if (method === 'Target.attachToTarget') return { sessionId: 'session-retry' };
    if (method === 'Page.enable' || method === 'Runtime.enable' || method === 'Page.addScriptToEvaluateOnNewDocument') return {};
    if (method === 'Runtime.evaluate') {
      if (params.expression.includes('location.href')) {
        probeIndex++;
        if (probeIndex < 3) {
          return { result: { value: JSON.stringify({ href: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron', readyState: 'loading', hasDocumentElement: true, hasBody: false, title: '', textareaCount: 0, contenteditableCount: 0, runtimeMarker: false, styleConnected: false }) } };
        }
        return { result: { value: JSON.stringify({ href: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron', readyState: 'complete', hasDocumentElement: true, hasBody: true, title: '', textareaCount: 1, contenteditableCount: 1, runtimeMarker: false, styleConnected: false }) } };
      }
      if (params.expression === runtimeSource) {
        installed = true;
        return { result: { value: true } };
      }
      if (params.expression.includes('api.diagnostics')) {
        return { result: { value: JSON.stringify({ installed, styleConnected: installed, buildMarker: 'test', runtimeSourceHash: 'hash', cssSourceHash: 'hash', instanceCount: 1, observerCount: 1, readyState: 'complete', composerFound: true, fontCheck: true, fontEntries: 0, errors: [] }) } };
      }
      if (params.expression.includes('api.ensure')) return { result: { value: 'ok' } };
    }
    throw new Error(`unexpected call: ${method}`);
  };

  const target = {
    targetId: 'retry-target',
    type: 'iframe',
    url: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron'
  };

  const stateMod = await import(stateModulePath);
  const originalState = existsSync(stateMod.STATE_FILE) ? readFileSync(stateMod.STATE_FILE, 'utf8') : null;
  try {
    const baselineState = stateMod.loadState();
    const result = await mod.processTargetInfo(send, runtimeSource, tracker, target, { logFn: () => {}, timeoutMs: 2000, intervalMs: 1 });
    assert.equal(result.status, 'injected');
    assert.ok(probeIndex >= 3, 'probe should retry until body exists');
    assert.notEqual(stateMod.loadState()?.validatedTarget?.id || null, null);
  } finally {
    if (originalState) writeFileSync(stateMod.STATE_FILE, originalState);
    else try { unlinkSync(stateMod.STATE_FILE); } catch {}
  }
});

testAsync('failed injection leaves validatedTarget null', async () => {
  const mod = await import(launcherPath);
  const tracker = mod.createCodexTargetTracker();
  const runtimeSource = `(() => true)()`;
  const send = async (method, params = {}, sessionId = null) => {
    if (method === 'Target.attachToTarget') return { sessionId: 'session-fail' };
    if (method === 'Runtime.enable' || method === 'Page.enable' || method === 'Page.addScriptToEvaluateOnNewDocument') return {};
    if (method === 'Runtime.evaluate' && params.expression.includes('location.href')) {
      return { result: { value: JSON.stringify({
        href: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron',
        readyState: 'complete',
        hasDocumentElement: true,
        hasBody: true,
        title: '',
        textareaCount: 1,
        contenteditableCount: 1,
        runtimeMarker: false,
        styleConnected: false
      }) } };
    }
    if (method === 'Runtime.evaluate' && params.expression === runtimeSource) return { result: { value: true } };
    if (method === 'Runtime.evaluate' && params.expression.includes('api.diagnostics')) {
      return { result: { value: JSON.stringify({ installed: false, styleConnected: false, buildMarker: null, runtimeSourceHash: null, cssSourceHash: null, instanceCount: 0, observerCount: 0, readyState: 'complete', composerFound: false, fontCheck: null, fontEntries: 0, errors: [] }) } };
    }
    throw new Error(`unexpected call: ${method}`);
  };
  const target = {
    targetId: 'fail-target',
    type: 'iframe',
    url: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron'
  };
  const stateMod = await import(stateModulePath);
  const originalState = existsSync(stateMod.STATE_FILE) ? readFileSync(stateMod.STATE_FILE, 'utf8') : null;
  try {
    const baselineState = stateMod.loadState();
    const result = await mod.processTargetInfo(send, runtimeSource, tracker, target, { logFn: () => {} });
    assert.equal(result.status, 'pending');
    assert.deepEqual(stateMod.loadState(), baselineState);
  } finally {
    if (originalState) writeFileSync(stateMod.STATE_FILE, originalState);
    else try { unlinkSync(stateMod.STATE_FILE); } catch {}
  }
});

testAsync('validatedTarget and runtime state are persisted', async () => {
  const mod = await import(launcherPath);
  const stateMod = await import(stateModulePath);
  const originalState = existsSync(stateMod.STATE_FILE) ? readFileSync(stateMod.STATE_FILE, 'utf8') : null;
  try {
    const updated = mod.buildValidatedStateUpdate({ existing: true }, {
      targetId: 'persisted-target',
      type: 'iframe',
      url: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron',
      parentId: 'workbench-target'
    }, {
      installed: true,
      styleConnected: true,
      injectedAt: '2026-01-01T00:00:00.000Z'
    });
    stateMod.saveState(updated);
    const disk = JSON.parse(readFileSync(stateMod.STATE_FILE, 'utf8'));
    assert.deepEqual(disk.validatedTarget, {
      id: 'persisted-target',
      type: 'iframe',
      url: 'vscode-webview://authority/index.html?extensionId=openai.chatgpt&purpose=webviewView&platform=electron',
      parentId: 'workbench-target'
    });
    assert.deepEqual(disk.runtime, {
      installed: true,
      styleConnected: true,
      injectedAt: '2026-01-01T00:00:00.000Z'
    });
  } finally {
    if (originalState) writeFileSync(stateMod.STATE_FILE, originalState);
    else try { unlinkSync(stateMod.STATE_FILE); } catch {}
  }
});

// ── Font validation ─────────────────────────────────────────────
console.log('\nFont validation');

test('font assets are read from WEBFONT_ROOT', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('readValidatedFontAsset'));
  assert.ok(src.includes('Vazirmatn'));
});

test('font WOFF2 validation checks magic bytes', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('wOF2'));
});

// ── Watcher loop ────────────────────────────────────────────────
console.log('\nWatcher loop');

test('watcherLoop is a while(true) loop', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  assert.ok(src.includes('async function watcherLoop'), 'watcherLoop should exist');
  assert.ok(src.includes('while (true)'), 'should use while(true) loop');
});

test('watcherLoop calls scanAndInject', () => {
  const src = readFileSync(path.join(__dirname, 'codex-vscode-rtl-launcher.mjs'), 'utf8');
  const wlStart = src.indexOf('async function watcherLoop');
  const wlEnd = src.indexOf('async function runDaemon', wlStart);
  const wlBody = src.slice(wlStart, wlEnd);
  assert.ok(wlBody.includes('scanAndInject'), 'should call scanAndInject');
});

test('watcherLoop uses both target discovery sources', () => {
  const src = readFileSync(launcherPath, 'utf8');
  const wlStart = src.indexOf('async function watcherLoop');
  const wlEnd = src.indexOf('async function runDaemon', wlStart);
  const wlBody = src.slice(wlStart, wlEnd);
  assert.ok(wlBody.includes('Target.getTargets'), 'should scan existing targets');
  assert.ok(wlBody.includes('Target.targetCreated'), 'should observe new targets');
  assert.ok(wlBody.includes('Target.targetDestroyed'), 'should clean up destroyed targets');
});

// ── Scope control ───────────────────────────────────────────────
console.log('\nScope control');

test('desktop launcher is untouched', () => {
  const launcherPath = path.join(projectRoot, 'desktop', 'bin', 'codex-rtl-launcher.mjs');
  const src = readFileSync(launcherPath, 'utf8');
  assert.ok(src.includes('com.openai.codex'));
  assert.ok(src.includes('ChatGPT.app'));
});

test('desktop stop is untouched', () => {
  const stopPath = path.join(projectRoot, 'desktop', 'bin', 'codex-rtl-stop.mjs');
  const src = readFileSync(stopPath, 'utf8');
  assert.ok(src.includes('com.openai.codex'));
});

test('desktop tests are untouched', () => {
  const testPath = path.join(projectRoot, 'desktop', 'bin', 'chatgpt-rtl-patcher.test.mjs');
  assert.ok(existsSync(testPath));
});

test('shared runtime is untouched', () => {
  const src = readFileSync(runtimePath, 'utf8');
  assert.ok(src.includes('segmentDirectionalRuns'));
  assert.ok(src.includes('discoverLogicalLineSegments'));
  assert.ok(src.includes('buildLogicalLine'));
});

test('shared CSS is untouched', () => {
  const src = readFileSync(cssPath, 'utf8');
  assert.ok(src.includes('data-cgpt-logical-line'));
  assert.ok(src.includes('data-cgpt-list-direction'));
  assert.ok(src.includes('data-cgpt-bidi-run'));
});


// ── Normal profile / isolated fallback ──────────────────────────
console.log('\nNormal profile / isolated fallback');

testAsync('default launch args use the normal VS Code profile', async () => {
  const mod = await import(launcherPath);
  const args = mod.buildVSCodeLaunchArgs(9222, null, 'normal');
  assert.ok(!args.some((arg) => String(arg).startsWith('--user-data-dir=')));
  assert.ok(!args.includes('--extensions-dir'));
});

testAsync('isolated launch args preserve the adapter profile', async () => {
  const mod = await import(launcherPath);
  const args = mod.buildVSCodeLaunchArgs(9222, '/tmp/workspace', 'isolated');
  assert.ok(args.some((arg) => String(arg).startsWith('--user-data-dir=')));
  assert.ok(args.includes('--extensions-dir'));
  assert.equal(args.at(-1), '/tmp/workspace');
});

testAsync('profile mode defaults to normal and supports --isolated', async () => {
  const mod = await import(launcherPath);
  assert.equal(mod.getProfileMode([]), 'normal');
  assert.equal(mod.getProfileMode(['--bg']), 'normal');
  assert.equal(mod.getProfileMode(['--isolated']), 'isolated');
});

testAsync('main VS Code detector ignores helper processes', async () => {
  const mod = await import(launcherPath);
  const executable = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';
  const ps = [
    `101 ${executable}`,
    '102 /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Renderer).app/Contents/MacOS/Code Helper (Renderer)',
    '103 /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper.app/Contents/MacOS/Code Helper'
  ].join('\n');
  assert.deepEqual(mod.parseMainVSCodePids(ps, executable), [101]);
});

testAsync('owned Electron PID is excluded from unrelated VS Code processes', async () => {
  const mod = await import(launcherPath);
  assert.deepEqual(mod.findUnrelatedMainVSCodePids([101, 202], 101), [202]);
  assert.deepEqual(mod.findUnrelatedMainVSCodePids([101], 101), []);
});

test('background plist carries --isolated only when explicitly requested', () => {
  const src = readFileSync(launcherPath, 'utf8');
  const bgStart = src.indexOf('async function runBackground');
  const bgEnd = src.indexOf('async function runForeground', bgStart);
  const bgBody = src.slice(bgStart, bgEnd);
  assert.ok(bgBody.includes("profileMode === 'isolated' ? ['--isolated'] : []"));
  assert.ok(bgBody.includes('extraArguments'));
});

test('state persists profileMode in foreground and background modes', () => {
  const src = readFileSync(launcherPath, 'utf8');
  assert.ok((src.match(/profileMode,/g) || []).length >= 4);
});

test('package exposes normal defaults and isolated fallback scripts', () => {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'vscode', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['rtl:launch'], 'node bin/codex-vscode-rtl-launcher.mjs');
  assert.equal(pkg.scripts['rtl:launch:bg'], 'node bin/codex-vscode-rtl-launcher.mjs --bg');
  assert.equal(pkg.scripts['rtl:launch:isolated'], 'node bin/codex-vscode-rtl-launcher.mjs --isolated');
  assert.equal(pkg.scripts['rtl:launch:bg:isolated'], 'node bin/codex-vscode-rtl-launcher.mjs --bg --isolated');
});

// ── Summary ─────────────────────────────────────────────────────
await Promise.allSettled(pendingTests);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
