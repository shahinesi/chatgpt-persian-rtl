#!/usr/bin/env node
/**
 * Stop the RTL-enabled VS Code instance launched by codex-vscode-rtl-launcher.
 *
 * For background mode: runs launchctl bootout first, then stops owned Electron.
 * For foreground mode: stops adapter, then Electron.
 * Always clears state and removes plist if present.
 */
import { log, loadState, clearState, checkPid, launchctlIsLoaded, launchctlBootout, removePlist, SERVICE_LABEL, PLIST_PATH } from './vscode-rtl-state.mjs';
import { existsSync } from 'node:fs';

function killPidSync(pid, label, waitMs = 0) {
  if (!pid) return false;
  const { alive, comm } = checkPid(pid);
  if (!alive) {
    log(`${label} PID ${pid} not running. Skipping.`);
    return false;
  }
  log(`Stopping ${label} (PID ${pid}, ${comm})...`);
  try { process.kill(pid, 'SIGTERM'); } catch {}
  return true;
}

function waitForDeath(pid, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() >= deadline) { resolve(); return; }
      const { alive } = checkPid(pid);
      if (!alive) { resolve(); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

async function forceKill(pid, label) {
  if (!pid) return;
  const { alive } = checkPid(pid);
  if (!alive) return;
  log(`Force killing ${label} (PID ${pid})...`);
  try { process.kill(pid, 'SIGKILL'); } catch {}
}

async function main() {
  const state = loadState();

  if (!state) {
    log('No launcher state found. Nothing to stop.');
    // Still try to clean up any orphaned plist
    if (existsSync(PLIST_PATH)) {
      log(`Removing orphaned plist: ${PLIST_PATH}`);
      launchctlBootout();
      removePlist();
    }
    process.exit(0);
  }

  log(`State loaded: mode=${state.mode}, adapterPid=${state.adapterPid}, electronPid=${state.electronPid}`);

  // 1. If background mode, run launchctl bootout first
  if (state.mode === 'background' || state.serviceLabel) {
    if (launchctlIsLoaded()) {
      log(`Unloading LaunchAgent: ${SERVICE_LABEL}`);
      const result = launchctlBootout();
      log(`Bootout result: ${result.ok ? 'ok' : 'failed'}${result.stderr ? ' - ' + result.stderr : ''}`);

      // Verify service is no longer loaded
      await new Promise(r => setTimeout(r, 1000));
      if (launchctlIsLoaded()) {
        log('WARNING: Service still loaded after bootout. Trying force stop...');
        // Force kill adapter — KeepAlive would restart it otherwise
        killPidSync(state.adapterPid, 'Adapter');
        await waitForDeath(state.adapterPid, 3000);
      }
    } else {
      log('LaunchAgent not loaded. Skipping bootout.');
    }
  }

  // 2. Stop adapter/daemon — it owns Electron lifecycle
  killPidSync(state.adapterPid, 'Adapter');

  // 3. Wait briefly for adapter to gracefully terminate Electron
  if (state.adapterPid) {
    await waitForDeath(state.adapterPid, 5000);
  }

  // 4. Terminate Electron if still alive
  await forceKill(state.electronPid, 'Electron');

  // 5. Remove plist
  if (existsSync(PLIST_PATH)) {
    log(`Removing plist: ${PLIST_PATH}`);
    removePlist();
  }

  // 6. Cleanup
  clearState();
  log('State cleared. Done.');
}

main().catch((error) => {
  process.stderr.write(`FATAL: ${error.stack || error.message}\n`);
  process.exit(1);
});
