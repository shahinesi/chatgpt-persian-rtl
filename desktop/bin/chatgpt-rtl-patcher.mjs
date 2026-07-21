#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageWithOptions, extractAll } from '@electron/asar';
import plist from 'plist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const chromeFontRoot = path.join(projectRoot, 'chrome-plugin', 'fonts');
const patchCssTemplatePath = path.join(desktopRoot, 'shared', 'rtl-patch.css');
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

function resolveTarget() {
  const targetPlatform = platform();
  const rootCandidates = customPath ? [customPath] : candidateRoots(targetPlatform);

  for (const candidate of rootCandidates) {
    const resolved = path.resolve(candidate);
    const asarPath = resolved.endsWith('app.asar')
      ? resolved
      : path.join(resourcesPathFromApp(resolved, targetPlatform), 'app.asar');

    if (!existsSync(asarPath)) continue;

    const resourcesPath = path.dirname(asarPath);
    const appPath = targetPlatform === 'darwin'
      ? resourcesPath.replace(/\/Contents\/Resources$/u, '')
      : path.dirname(resourcesPath);

    return {
      platform: targetPlatform,
      appPath,
      resourcesPath,
      asarPath,
      backupPath: `${asarPath}${backupSuffix}`,
      infoPlistPath: targetPlatform === 'darwin'
        ? path.join(appPath, 'Contents', 'Info.plist')
        : null
    };
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

function patchCss() {
  if (!existsSync(patchCssTemplatePath)) fail(`فایل CSS پچ پیدا نشد: ${patchCssTemplatePath}`);

  return readFileSync(patchCssTemplatePath, 'utf8')
    .replace('__VAZIRMATN_REGULAR__', readFontAsDataUrl('Vazirmatn-Regular.ttf'))
    .replace('__VAZIRMATN_BOLD__', readFontAsDataUrl('Vazirmatn-Bold.ttf'));
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

function injectStyles(root) {
  const css = patchCss();
  const cssFiles = walkFiles(root, (file) => file.endsWith('.css'));
  const jsFiles = walkFiles(root, (file) => file.endsWith('.js'));
  let changed = 0;

  for (const file of cssFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes(marker)) continue;

    writeFileSync(file, `${content}\n\n${css}\n`);
    changed += 1;
  }

  if (changed > 0) return changed;

  const jsInjection = `
;try {
  const css = ${JSON.stringify(css)};
  const style = document.createElement('style');
  style.setAttribute('data-chatgpt-persian-rtl', 'desktop');
  style.textContent = css;
  document.documentElement.appendChild(style);
} catch (_) {}
`;

  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes(marker)) continue;

    writeFileSync(file, `${content}\n\n${jsInjection}\n`);
    changed += 1;
    break;
  }

  return changed;
}

function updateMacIntegrity(target) {
  if (target.platform !== 'darwin' || !target.infoPlistPath || !existsSync(target.infoPlistPath)) return;

  const hash = createHash('sha256').update(readFileSync(target.asarPath)).digest('hex');
  const parsed = plist.parse(readFileSync(target.infoPlistPath, 'utf8'));
  const integrity = parsed?.ElectronAsarIntegrity?.['Resources/app.asar'];

  if (integrity && typeof integrity === 'object') {
    integrity.hash = hash;
    writeFileSync(target.infoPlistPath, plist.build(parsed));
  }

  try {
    execFileSync('codesign', ['--remove-signature', target.appPath], { stdio: 'ignore' });
  } catch {}

  try {
    execFileSync('xattr', ['-cr', target.appPath], { stdio: 'ignore' });
  } catch {}
}

async function patch(target) {
  log(`مسیر ChatGPT: ${target.appPath}`);
  log('در حال ساخت نسخه‌ی پشتیبان...');

  if (!existsSync(target.backupPath)) {
    copyFileSync(target.asarPath, target.backupPath);
  }

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  try {
    log('در حال استخراج app.asar...');
    extractAll(target.asarPath, tempDir);

    log('در حال تزریق RTL و فونت Vazirmatn...');
    const changed = injectStyles(tempDir);
    if (changed === 0) throw new Error('هیچ فایل CSS یا JS مناسبی برای تزریق پیدا نشد.');

    log('در حال ساخت دوباره app.asar...');
    await createPackageWithOptions(tempDir, target.asarPath, {
      unpack: '{*.node,*.dll,*.dylib,*.so,spawn-helper}'
    });

    updateMacIntegrity(target);
    log('پچ دسکتاپ با موفقیت انجام شد. ChatGPT را کامل ببندید و دوباره باز کنید.');
  } catch (error) {
    if (existsSync(target.backupPath)) copyFileSync(target.backupPath, target.asarPath);
    updateMacIntegrity(target);
    fail(`پچ ناموفق بود و backup برگردانده شد. ${error.message}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function restore(target) {
  if (!existsSync(target.backupPath)) {
    fail('نسخه‌ی پشتیبان پیدا نشد. احتمالا برنامه قبلا restore شده یا هنوز patch نشده است.');
  }

  copyFileSync(target.backupPath, target.asarPath);
  updateMacIntegrity(target);
  log('بازگردانی انجام شد. ChatGPT را کامل ببندید و دوباره باز کنید.');
}

const target = resolveTarget();

if (isRestore) {
  restore(target);
} else {
  await patch(target);
}
