/**
 * Shared state module for the VS Code RTL adapter.
 *
 * All three commands (launcher, diagnose, stop) import this module
 * and use exactly one canonical state-file path.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STATE_DIR = path.join(
  process.env.HOME || '~',
  'Library', 'Application Support', 'chatgpt-persian-rtl', 'vscode-profile'
);

export const STATE_FILE = path.join(STATE_DIR, 'rtl-launcher-state.json');

export const LOG_FILE = path.join(STATE_DIR, 'rtl-adapter.log');

export const PATCH_ID = 'chatgpt-persian-rtl-desktop-runtime';

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const DESKTOP_SHARED = path.resolve(PROJECT_ROOT, 'desktop', 'shared');

export const RUNTIME_PATH = path.join(DESKTOP_SHARED, 'rtl-runtime.js');

export const CSS_PATH = path.join(DESKTOP_SHARED, 'rtl-patch.css');

export const FONT_ROOT = path.join(DESKTOP_SHARED, 'fonts');

export const WEBFONT_ROOT = path.join(FONT_ROOT, 'webfonts');

export const RUNTIME_BUILD_MARKER = 'vscode-rtl-live-v1';

export const VSCODE_CANDIDATES = [
  '/Applications/Visual Studio Code.app',
  '/Applications/Visual Studio Code - Insiders.app'
];

// ── LaunchAgent constants ────────────────────────────────────────
export const SERVICE_LABEL = 'com.shahineskandari.chatgpt-persian-rtl.vscode';

export const PLIST_DIR = path.join(process.env.HOME || '~', 'Library', 'LaunchAgents');

export const PLIST_PATH = path.join(PLIST_DIR, `${SERVICE_LABEL}.plist`);

export function getUID() {
  return spawnSync('id', ['-u'], { encoding: 'utf8' }).stdout.trim() || '501';
}

// ── Logging ──────────────────────────────────────────────────────
export function log(msg) { process.stderr.write(`${msg}\n`); }

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Atomic state writes ──────────────────────────────────────────
/**
 * Atomic state write: write to a temp file, then rename over the canonical path.
 */
export function saveState(state) {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

/**
 * Load the canonical state file. Returns null if missing or corrupt.
 */
export function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

/**
 * Remove the state file. Tolerant of missing file.
 */
export function clearState() {
  try { unlinkSync(STATE_FILE); } catch {}
}

/**
 * Check whether a PID is alive and belongs to a VS Code / Electron process.
 * Returns { alive, comm }.
 */
export function checkPid(pid) {
  if (!pid) return { alive: false, comm: '' };
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
  const comm = (result.stdout || '').trim().toLowerCase();
  const alive = result.status === 0 && comm.length > 0;
  return { alive, comm };
}

/**
 * Test whether CDP is reachable at the given port.
 * Returns the /json/version object or null.
 */
export async function checkCDP(port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(300);
  }
  return null;
}

/**
 * Wait for CDP to become reachable. Throws on timeout.
 */
export async function waitForCDP(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(500);
  }
  throw new Error(`Timed out waiting for CDP on port ${port}`);
}

// ── Plist generation ─────────────────────────────────────────────
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a macOS LaunchAgent plist for the RTL adapter daemon.
 * Uses absolute paths. No npm or shell command strings.
 */
export function generatePlist({ nodeExecutable, scriptPath, logFile, workingDir, extraArguments = [] }) {
  const extraArgumentXml = extraArguments
    .map((argument) => `\t\t<string>${escapeXml(argument)}</string>`)
    .join('\n');
  const programArguments = [
    `\t\t<string>${escapeXml(nodeExecutable)}</string>`,
    `\t\t<string>${escapeXml(scriptPath)}</string>`,
    '\t\t<string>--daemon</string>',
    extraArgumentXml
  ].filter(Boolean).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${escapeXml(SERVICE_LABEL)}</string>
\t<key>ProgramArguments</key>
\t<array>
${programArguments}
\t</array>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<true/>
\t<key>WorkingDirectory</key>
\t<string>${escapeXml(workingDir)}</string>
\t<key>StandardOutPath</key>
\t<string>${escapeXml(logFile)}</string>
\t<key>StandardErrorPath</key>
\t<string>${escapeXml(logFile)}</string>
</dict>
</plist>`;
}

/**
 * Write plist atomically (temp + rename). Creates LaunchAgents dir if needed.
 */
export function writePlist(content) {
  mkdirSync(PLIST_DIR, { recursive: true });
  const tmp = `${PLIST_PATH}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, content);
  renameSync(tmp, PLIST_PATH);
}

/**
 * Remove the plist file. Tolerant of missing file.
 */
export function removePlist() {
  try { unlinkSync(PLIST_PATH); } catch {}
}

// ── launchctl helpers ────────────────────────────────────────────
function launchctlSync(args) {
  return spawnSync('launchctl', args, { encoding: 'utf8', timeout: 10000 });
}

/**
 * Check if the LaunchAgent service is loaded.
 */
export function launchctlIsLoaded() {
  const uid = getUID();
  const result = launchctlSync(['list', SERVICE_LABEL]);
  return result.status === 0 && result.stdout.includes(SERVICE_LABEL);
}

/**
 * Bootstrap the LaunchAgent service (load it).
 */
export function launchctlBootstrap() {
  const uid = getUID();
  const result = launchctlSync(['bootstrap', `gui/${uid}`, PLIST_PATH]);
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/**
 * Kickstart the LaunchAgent service (restart it).
 */
export function launchctlKickstart() {
  const uid = getUID();
  const result = launchctlSync(['kickstart', '-k', `gui/${uid}/${SERVICE_LABEL}`]);
  return { ok: result.status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/**
 * Bootout (unload) the LaunchAgent service.
 */
export function launchctlBootout() {
  const uid = getUID();
  const result = launchctlSync(['bootout', `gui/${uid}/${SERVICE_LABEL}`]);
  // bootout returns non-zero if service wasn't loaded — that's OK
  return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

/**
 * Remove a stale service if it exists.
 */
export function launchctlRemoveStale() {
  if (launchctlIsLoaded()) {
    return launchctlBootout();
  }
  return { ok: true, stdout: '', stderr: '' };
}

/**
 * Print detailed service info (for diagnose).
 */
export function launchctlPrint() {
  const uid = getUID();
  const result = launchctlSync(['print', `gui/${uid}/${SERVICE_LABEL}`]);
  return { ok: result.status === 0, output: result.stdout || result.stderr };
}
