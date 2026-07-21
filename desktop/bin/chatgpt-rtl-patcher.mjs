#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageWithOptions, extractAll, getRawHeader, listPackage } from '@electron/asar';
import plist from 'plist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const chromeFontRoot = path.join(projectRoot, 'chrome-plugin', 'fonts');
const patchCssTemplatePath = path.join(desktopRoot, 'shared', 'rtl-patch.css');
const patchRuntimeTemplatePath = path.join(desktopRoot, 'shared', 'rtl-runtime.js');
const marker = 'ChatGPT Persian RTL desktop patch';
const backupSuffix = '.chatgpt-persian-rtl.bak';
const tempDir = path.join(tmpdir(), 'chatgpt-persian-rtl-desktop');

const args = new Set(process.argv.slice(2));
const customPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const isRestore = args.has('--restore');
const explicitPlatform = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--platform='))
  ?.split('=')[1];

function platform() {
  if (explicitPlatform === 'macos' || explicitPlatform === 'darwin') return 'darwin';
  if (explicitPlatform === 'windows' || explicitPlatform === 'win32') return 'win32';
  return process.platform;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`خطا: ${message}\n`);
  process.exit(1);
}

function isMacAppPath(appPath) {
  return platform() === 'darwin' && appPath.endsWith('.app');
}

function candidateRoots(targetPlatform) {
  if (targetPlatform === 'darwin') {
    return [
      '/Applications/ChatGPT.app',
      path.join(homedir(), 'Applications', 'ChatGPT.app')
    ];
  }

  if (targetPlatform === 'win32') {
    return [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'ChatGPT'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ChatGPT'),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'ChatGPT'),
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'ChatGPT')
    ].filter(Boolean);
  }

  return [];
}

function resourcesPathFromApp(appPath, targetPlatform) {
  if (targetPlatform === 'darwin' && appPath.endsWith('.app')) {
    return path.join(appPath, 'Contents', 'Resources');
  }

  return path.join(appPath, 'resources');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function resolveTarget() {
  const targetPlatform = platform();
  const rootCandidates = customPath ? [customPath] : candidateRoots(targetPlatform);

  for (const candidate of rootCandidates) {
    const resolved = path.resolve(candidate);
    const stat = statSync(resolved);

    if (stat.isDirectory()) {
      const indexHtml = path.join(resolved, 'webview', 'index.html');
      if (existsSync(indexHtml)) {
        return {
          platform: targetPlatform,
          appPath: resolved,
          resourcesPath: resolved,
          asarPath: path.join(resolved, '__extracted__.asar'),
          backupPath: path.join(resolved, '__extracted__.asar.chatgpt-persian-rtl.bak'),
          hasPrimaryAsar: false,
          infoPlistPath: null
        };
      }
    }

    const asarPath = resolved.endsWith('app.asar')
      ? resolved
      : path.join(resourcesPathFromApp(resolved, targetPlatform), 'app.asar');
    const backupPath = `${asarPath}${backupSuffix}`;

    if (!existsSync(asarPath) && !existsSync(backupPath)) continue;

    const resourcesPath = path.dirname(asarPath);
    const appPath = targetPlatform === 'darwin'
      ? resourcesPath.replace(/\/Contents\/Resources$/u, '')
      : path.dirname(resourcesPath);

    return {
      platform: targetPlatform,
      appPath,
      resourcesPath,
      asarPath,
      backupPath,
      hasPrimaryAsar: existsSync(asarPath),
      infoPlistPath: targetPlatform === 'darwin'
        ? path.join(appPath, 'Contents', 'Info.plist')
        : null
    };
  }

  if (customPath && isMacAppPath(path.resolve(customPath))) {
    fail(
      `این برنامه فایل app.asar ندارد و احتمالا native است: ${customPath}\n` +
      'پچر فعلی فقط اپ‌های Electron/asar را patch می‌کند. برای ChatGPT Classic هیچ تغییری اعمال نشد.'
    );
  }

  fail(
    customPath
      ? `فایل app.asar در مسیر داده‌شده پیدا نشد: ${customPath}`
      : 'ChatGPT Desktop پیدا نشد. مسیر ChatGPT.app یا app.asar را به دستور اضافه کنید.'
  );
}

function readFontAsDataUrl(fileName) {
  const fontPath = path.join(chromeFontRoot, fileName);
  if (!existsSync(fontPath)) fail(`فونت پیدا نشد: ${fontPath}`);

  const base64 = readFileSync(fontPath).toString('base64');
  return `data:font/ttf;base64,${base64}`;
}

function processPathForTarget(target) {
  if (target.platform === 'darwin') {
    return path.join(target.appPath, 'Contents', 'MacOS', 'ChatGPT');
  }

  return null;
}

function patchCss() {
  if (!existsSync(patchCssTemplatePath)) fail(`فایل CSS پچ پیدا نشد: ${patchCssTemplatePath}`);

  return readFileSync(patchCssTemplatePath, 'utf8')
    .replace('__VAZIRMATN_REGULAR__', readFontAsDataUrl('Vazirmatn-Regular.ttf'))
    .replace('__VAZIRMATN_BOLD__', readFontAsDataUrl('Vazirmatn-Bold.ttf'));
}

function patchRuntime() {
  if (!existsSync(patchRuntimeTemplatePath)) fail(`فایل runtime پچ پیدا نشد: ${patchRuntimeTemplatePath}`);

  return readFileSync(patchRuntimeTemplatePath, 'utf8')
    .replace('__CHATGPT_PERSIAN_RTL_CSS__', JSON.stringify(patchCss()));
}

function walkFiles(root, predicate, files = []) {
  if (!existsSync(root)) return files;

  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkFiles(fullPath, predicate, files);
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function isRuntimeCandidate(file, root) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  if (!relative.endsWith('.js')) return false;
  if (relative.includes('/node_modules/')) return false;
  if (relative.startsWith('.vite/build/')) return false;

  return (
    /^webview\/assets\/(?:app-main|chatgpt-conversation-page|thread-user-message|composer-|local-conversation-thread|remote-conversation-page).*\.js$/u.test(relative) ||
    /^webview\/assets\/app-initial.*chatgpt.*\.js$/u.test(relative)
  );
}

const LAYER_DECLARATION_PATCHED = '@layer chatgpt-rtl, theme, base, components, utilities;';
const LAYER_ORIGINAL_RE = /@layer\s+theme\s*,\s*base\s*,\s*components\s*,\s*utilities\s*;/;
const SOURCE_MAP_RE = /^\/\/# sourceMappingURL=\S+\s*$/m;

function injectLayerIntoIndexHtml(root) {
  const indexPath = path.join(root, 'webview', 'index.html');
  if (!existsSync(indexPath)) return false;

  const content = readFileSync(indexPath, 'utf8');
  if (content.includes(LAYER_DECLARATION_PATCHED)) return false;
  if (!LAYER_ORIGINAL_RE.test(content)) return false;

  writeFileSync(indexPath, content.replace(LAYER_ORIGINAL_RE, LAYER_DECLARATION_PATCHED));
  return true;
}

function injectStyles(root) {
  const css = patchCss();
  const cssFiles = walkFiles(root, (file) => file.endsWith('.css'));
  const jsRuntime = `\n/* ${marker}: runtime */\n${patchRuntime()}\n`;
  const jsFiles = walkFiles(root, (file) => isRuntimeCandidate(file, root));
  let changed = 0;

  for (const file of cssFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes(marker)) continue;

    writeFileSync(file, `${content}\n\n${css}\n`);
    changed += 1;
  }

  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes(marker)) continue;

    const sourceMapMatch = SOURCE_MAP_RE.exec(content);
    let patched;
    if (sourceMapMatch) {
      const insertAt = sourceMapMatch.index;
      patched = content.slice(0, insertAt) + jsRuntime + content.slice(insertAt);
    } else {
      patched = content + jsRuntime;
    }
    writeFileSync(file, patched);
    changed += 1;
  }

  if (injectLayerIntoIndexHtml(root)) {
    log('لایه‌بندی CSS در index.html اعمال شد.');
    changed += 1;
  }

  return changed;
}

function updateMacIntegrity(target) {
  if (
    target.platform !== 'darwin' ||
    !target.infoPlistPath ||
    !existsSync(target.infoPlistPath) ||
    !existsSync(target.asarPath)
  ) {
    return;
  }

  const { headerString } = getRawHeader(target.asarPath);
  const hash = createHash('sha256').update(headerString).digest('hex');
  const parsed = plist.parse(readFileSync(target.infoPlistPath, 'utf8'));
  const integrity = parsed?.ElectronAsarIntegrity?.['Resources/app.asar'];

  if (integrity && typeof integrity === 'object') {
    integrity.hash = hash;
    writeFileSync(target.infoPlistPath, plist.build(parsed));
  }
}

function refreshMacLaunchMetadata(target) {
  if (target.platform !== 'darwin') return;

  execFileSync('xattr', ['-cr', target.appPath], { stdio: 'ignore' });
}

function signMacApp(target) {
  if (target.platform !== 'darwin') return;

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', target.appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const details = String(error.stderr || error.stdout || error.message).trim();
    throw new Error(
      `ساخت امضای ad-hoc برای macOS ناموفق بود. ` +
      `codesign: ${error.status ?? error.code ?? 'unknown'}${details ? `\n${details}` : ''}`
    );
  }
}

function verifyMacSignature(target) {
  if (target.platform !== 'darwin') return;

  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', target.appPath], {
      stdio: 'ignore'
    });
  } catch (error) {
    throw new Error(
      `اعتبارسنجی امضای macOS ناموفق بود. ` +
      `codesign --verify: ${error.status ?? error.code ?? error.message}`
    );
  }
}

function verifyWritableTarget(target) {
  const writeTestPath = path.join(target.resourcesPath, `.chatgpt-persian-rtl-write-test-${process.pid}`);

  try {
    writeFileSync(writeTestPath, 'ok');
    unlinkSync(writeTestPath);
  } catch (error) {
    fail(
      `اجازه نوشتن در مسیر برنامه وجود ندارد: ${target.resourcesPath}\n` +
      `جزئیات: ${error.code ?? error.message}\n` +
      'در macOS برای تغییر برنامه‌های داخل /Applications باید به Terminal یا IDE مجوز App Management / Full Disk Access بدهید و دوباره اجرا کنید.'
    );
  }
}

function ensureTargetClosed(target) {
  const processPath = processPathForTarget(target);
  if (!processPath) return;
  const killPatterns = [
    target.appPath,
    path.join(target.resourcesPath, 'codex'),
    path.join(target.resourcesPath, 'ChatGPTHelper'),
    path.join(target.appPath, 'Contents', 'Frameworks', 'Codex Framework.framework')
  ];

  for (const pattern of killPatterns) {
    try {
      execFileSync('pkill', ['-f', pattern], { stdio: 'ignore' });
    } catch {}
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      let hasLiveProcess = false;
      for (const pattern of killPatterns) {
        try {
          execFileSync('pgrep', ['-f', pattern], { stdio: 'ignore' });
          hasLiveProcess = true;
          break;
        } catch {}
      }

      if (!hasLiveProcess) return;
      sleep(250);
    } catch {
      return;
    }
  }

  fail(
    `برنامه هنوز در حال اجراست و نمی‌شود آن را امن patch کرد: ${target.appPath}\n` +
    'ChatGPT را کامل ببندید و دوباره نصب/بازگردانی را اجرا کنید.'
  );
}

async function patch(target) {
  log(`مسیر ChatGPT: ${target.appPath}`);

  if (!target.hasPrimaryAsar && existsSync(path.join(target.resourcesPath, 'webview', 'index.html'))) {
    log('حالت استخراج شده — تزریق مستقیم...');
    const changed = injectStyles(target.resourcesPath);
    if (changed === 0) throw new Error('هیچ فایل CSS یا JS مناسبی برای تزریق پیدا نشد.');
    log(`تزریق انجام شد: ${changed} فایل تغییر کرد.`);
    return;
  }

  if (!target.hasPrimaryAsar) {
    fail(
      `فایل app.asar اصلی پیدا نشد: ${target.asarPath}\n` +
      'به نظر می‌رسد patch قبلی نیمه‌کاره مانده است. ابتدا restore را اجرا کنید.'
    );
  }

  ensureTargetClosed(target);
  verifyWritableTarget(target);
  log('در حال ساخت نسخه‌ی پشتیبان...');

  if (!existsSync(target.backupPath)) {
    copyFileSync(target.asarPath, target.backupPath);
  }

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  const packagedAsarPath = path.join(tmpdir(), `chatgpt-persian-rtl-packaged-${process.pid}.asar`);
  rmSync(packagedAsarPath, { force: true });

  try {
    log('در حال استخراج app.asar...');
    extractAll(target.asarPath, tempDir);

    log('در حال تزریق RTL و فونت Vazirmatn...');
    const changed = injectStyles(tempDir);
    if (changed === 0) throw new Error('هیچ فایل CSS یا JS مناسبی برای تزریق پیدا نشد.');

    log('در حال ساخت دوباره app.asar...');
    await createPackageWithOptions(tempDir, packagedAsarPath, {
      unpack: '{*.node,*.dll,*.dylib,*.so,spawn-helper}'
    });
    if (!existsSync(packagedAsarPath)) {
      throw new Error('فایل app.asar جدید ساخته نشد.');
    }

    copyFileSync(packagedAsarPath, target.asarPath);
    target.hasPrimaryAsar = true;

    updateMacIntegrity(target);
    refreshMacLaunchMetadata(target);
    signMacApp(target);
    verifyMacSignature(target);
    log('پچ دسکتاپ با موفقیت انجام شد. ChatGPT را کامل ببندید و دوباره باز کنید.');
  } catch (error) {
    let rollbackError = null;
    if (existsSync(target.backupPath)) {
      try {
        copyFileSync(target.backupPath, target.asarPath);
        target.hasPrimaryAsar = true;
        updateMacIntegrity(target);
        refreshMacLaunchMetadata(target);
        signMacApp(target);
        verifyMacSignature(target);
      } catch (restoreError) {
        rollbackError = restoreError;
      }
    }
    fail(
      `پچ ناموفق بود${rollbackError ? ' و امضای backup نیز کامل نشد' : ' و backup برگردانده شد'}. ` +
      `${error.message}${rollbackError ? `\nخطای rollback: ${rollbackError.message}` : ''}`
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(packagedAsarPath, { force: true });
  }
}

function restore(target) {
  if (!existsSync(target.backupPath)) {
    fail('نسخه‌ی پشتیبان پیدا نشد. احتمالا برنامه قبلا restore شده یا هنوز patch نشده است.');
  }

  ensureTargetClosed(target);
  verifyWritableTarget(target);
  copyFileSync(target.backupPath, target.asarPath);
  target.hasPrimaryAsar = true;
  updateMacIntegrity(target);
  refreshMacLaunchMetadata(target);
  signMacApp(target);
  verifyMacSignature(target);
  log('بازگردانی انجام شد. ChatGPT را کامل ببندید و دوباره باز کنید.');
}

if (args.has('--list')) {
  if (!customPath || !existsSync(customPath)) {
    fail('--list requires a valid asar file or extracted-asar-root path');
  }
  const resolved = path.resolve(customPath);
  const isAsarFile = statSync(resolved).isFile();

  function isRuntimeCandidateRelative(relative) {
    if (!relative.endsWith('.js')) return false;
    if (relative.includes('/node_modules/')) return false;
    if (relative.startsWith('.vite/build/')) return false;
    return (
      /^webview\/assets\/(?:app-main|chatgpt-conversation-page|thread-user-message|composer-|local-conversation-thread|remote-conversation-page).*\.js$/u.test(relative) ||
      /^webview\/assets\/app-initial.*chatgpt.*\.js$/u.test(relative)
    );
  }

  if (isAsarFile) {
    const entries = listPackage(resolved);
    for (const entry of entries) {
      const relative = entry.replace(/^\//u, '');
      if (relative.endsWith('.css')) {
        console.log('css:' + relative);
      } else if (isRuntimeCandidateRelative(relative)) {
        console.log('js:' + relative);
      }
    }
    if (entries.some((e) => e === '/webview/index.html')) {
      console.log('index:webview/index.html');
    }
  } else {
    walkFiles(resolved, (file) => file.endsWith('.css'))
      .forEach((f) => console.log('css:' + path.relative(resolved, f)));
    walkFiles(resolved, (file) => isRuntimeCandidate(file, resolved))
      .forEach((f) => console.log('js:' + path.relative(resolved, f)));
    const indexPath = path.join(resolved, 'webview', 'index.html');
    if (existsSync(indexPath)) {
      console.log('index:webview/index.html');
    }
  }
  process.exit(0);
}

const target = resolveTarget();

if (isRestore) {
  restore(target);
} else {
  await patch(target);
}
