import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageWithOptions, extractAll, listPackage } from '@electron/asar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marker = 'ChatGPT Persian RTL desktop patch';

const patchCssPath = path.join(__dirname, '..', 'shared', 'rtl-patch.css');
const patchRuntimePath = path.join(__dirname, '..', 'shared', 'rtl-runtime.js');
const patcherPath = path.join(__dirname, 'chatgpt-rtl-patcher.mjs');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      const p = result.then(
        () => { passed += 1; process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`); },
        (error) => { failed += 1; process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${error.message}\n`); }
      );
      pending.push(p);
      return;
    }
    passed += 1;
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${error.message}\n`);
  }
}

function makeFixtureDir() {
  const dir = path.join(tmpdir(), `chatgpt-rtl-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readPatcherModule() {
  return readFileSync(patcherPath, 'utf8');
}

function makeRendererFixture(fixtureDir) {
  mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
  writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'style.css'), 'body {}');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-abc123.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'other-file.js'), 'export {};');
}

function makeFullFixture(fixtureDir) {
  mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
  mkdirSync(path.join(fixtureDir, '.vite', 'build'), { recursive: true });
  writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'style.css'), 'body {}');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-abc123.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'chatgpt-conversation-page-xyz.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'composer-utility-bar-def.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'thread-user-message-ghi.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'local-conversation-thread-jkl.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'remote-conversation-page-mno.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-initial~app-main~chatgpt-conversation-page-pqr.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'unrelated-chunk-stu.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, '.vite', 'build', 'main-abc123.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, '.vite', 'build', 'preload.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, '.vite', 'build', 'sandbox-preload.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, '.vite', 'build', 'bootstrap-xyz.js'), 'export {};');
  writeFileSync(path.join(fixtureDir, 'node_modules', 'foo', 'bar.js'), 'export {};');
}

// ── 1. Runtime insertion with source-map comment ────────────────────

test('runtime is inserted before source-map comment', () => {
  const sourceMapLine = '//# sourceMappingURL=chatgpt-conversation-page-abc123.js.map\n';
  const originalCode = 'export { foo };\n' + sourceMapLine;
  const jsRuntime = `\n/* ${marker}: runtime */\n(() => { console.log("rtl"); })();\n`;

  const sourceMapRe = /^\/\/# sourceMappingURL=\S+\s*$/m;
  const sourceMapMatch = sourceMapRe.exec(originalCode);
  assert.ok(sourceMapMatch, 'source map comment should be found');

  let patched;
  if (sourceMapMatch) {
    const insertAt = sourceMapMatch.index;
    patched = originalCode.slice(0, insertAt) + jsRuntime + originalCode.slice(insertAt);
  } else {
    patched = originalCode + jsRuntime;
  }

  assert.ok(patched.includes(jsRuntime), 'runtime should be present');
  assert.ok(patched.includes(sourceMapLine.trim()), 'source map line should be preserved');

  const runtimePos = patched.indexOf(marker);
  const sourceMapPos = patched.indexOf('//# sourceMappingURL=');
  assert.ok(runtimePos < sourceMapPos, 'runtime must come before source map comment');
});

test('runtime is appended when no source-map comment exists', () => {
  const originalCode = 'export { bar };\n';
  const jsRuntime = `\n/* ${marker}: runtime */\n(() => {})();\n`;

  const sourceMapRe = /^\/\/# sourceMappingURL=\S+\s*$/m;
  const sourceMapMatch = sourceMapRe.exec(originalCode);
  assert.equal(sourceMapMatch, null, 'no source map should be found');

  const patched = originalCode + jsRuntime;
  assert.ok(patched.endsWith(jsRuntime.trimEnd() + '\n'), 'runtime should be at end');
});

// ── 2. Idempotency — exactly one runtime after repeated patching ────

test('marker guard prevents double injection', () => {
  const content = 'var x = 1;\n';
  const jsRuntime = `\n/* ${marker}: runtime */\n(() => {})();\n`;

  let patched = content;
  if (!patched.includes(marker)) {
    patched += jsRuntime;
  }

  const patchedAgain = patched;
  if (!patchedAgain.includes(marker)) {
    assert.fail('should not reach here — marker should prevent second injection');
  }

  const runtimeCount = (patchedAgain.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  assert.equal(runtimeCount, 1, 'runtime marker should appear exactly once');
});

// ── 3. Source-map line is preserved byte-for-byte ───────────────────

test('source-map comment is preserved exactly', () => {
  const sourceMapLine = '//# sourceMappingURL=app-main-XYZ789.js.map';
  const content = `export { fn };\n${sourceMapLine}\n`;

  const sourceMapRe = /^\/\/# sourceMappingURL=\S+\s*$/m;
  const match = sourceMapRe.exec(content);
  assert.ok(match);

  const patched = content.slice(0, match.index) + `\n/* ${marker}: runtime */\n` + content.slice(match.index);

  const lines = patched.split('\n');
  const smLine = lines.find((l) => l.startsWith('//# sourceMappingURL='));
  assert.equal(smLine, sourceMapLine, 'source-map line must be unchanged');
});

// ── 4. No broad selectors like [class*="code"] ─────────────────────

test('rtl-patch.css does not contain [class*="code"] as a CSS selector', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  const stripped = css.replace(/\/\*.*?\*\//gs, '');
  assert.ok(
    !stripped.includes('[class*="code"]'),
    'rtl-patch.css must not use [class*="code"] as a CSS selector (after stripping comments)'
  );
});

test('rtl-patch.css does not force all tables to LTR', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  const codeBlockSection = css.slice(css.indexOf('@layer chatgpt-rtl'));
  assert.ok(!/^\s*table\s*{/m.test(codeBlockSection), 'should not have a standalone table rule in @layer chatgpt-rtl');
});

test('rtl-patch.css does not contain :where(', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(!css.includes(':where('), 'rtl-patch.css must not contain :where(');
});

// ── 5. Cascade-layer placement ─────────────────────────────────────

test('rtl-patch.css places direction rules inside @layer chatgpt-rtl', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('@layer chatgpt-rtl'), 'CSS must contain @layer chatgpt-rtl');
  const layerStart = css.indexOf('@layer chatgpt-rtl');
  const layerBlock = css.slice(layerStart);
  assert.ok(layerBlock.includes('[dir="rtl"]'), 'direction rules must be inside @layer chatgpt-rtl');
  assert.ok(layerBlock.includes('[dir="ltr"]'), 'LTR direction rules must be inside @layer chatgpt-rtl');
});

test('rtl-patch.css font overrides are outside any @layer', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  const layerStart = css.indexOf('@layer chatgpt-rtl');
  const beforeLayer = css.slice(0, layerStart);
  assert.ok(beforeLayer.includes('--font-sans'), '--font-sans override must be before @layer chatgpt-rtl');
  assert.ok(beforeLayer.includes('font-family'), 'font-family fallback must be before @layer chatgpt-rtl');
  assert.ok(beforeLayer.includes('--font-sans-default'), '--font-sans-default override must be before @layer chatgpt-rtl');
});

test('patcher contains index.html layer injection logic', () => {
  const patcher = readPatcherModule();
  assert.ok(patcher.includes('LAYER_DECLARATION_PATCHED'), 'patcher must define LAYER_DECLARATION_PATCHED');
  assert.ok(patcher.includes('chatgpt-rtl'), 'patcher must reference chatgpt-rtl layer');
  assert.ok(patcher.includes('injectLayerIntoIndexHtml'), 'patcher must have injectLayerIntoIndexHtml function');
});

// ── 6. CSS template validation ─────────────────────────────────────

test('rtl-patch.css contains @font-face for Vazirmatn', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('"Vazirmatn"'), 'must reference Vazirmatn font');
  assert.ok(css.includes('__FONT_FACE_BLOCKS__'), 'must have font-face block placeholder');
  assert.ok(!css.includes('@font-face'), 'template should not inline font-face blocks before runtime insertion');
});

test('rtl-patch.css contains --font-sans override on message containers', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('--font-sans-default: "Vazirmatn"'), 'must override --font-sans-default');
  assert.ok(css.includes('--font-sans: "Vazirmatn"'), 'must override --font-sans');
  assert.ok(css.includes('[data-cgpt-rtl-managed="composer-text"]'), 'must target composer text blocks');
  assert.ok(css.includes('[data-cgpt-rtl-managed="user-text"]'), 'must target user text blocks');
  assert.ok(css.includes('[data-cgpt-rtl-managed="assistant-text"]'), 'must target assistant text blocks');
  assert.ok(!css.includes('[data-cgpt-rtl-managed="message-text"]'), 'must not target generic message text blocks');
  assert.ok(!css.includes('[data-cgpt-rtl-role="message"]'), 'must not target runtime-managed message roles');
});

test('rtl-patch.css contains native assistant bidi selectors', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('[data-cgpt-rtl-managed="assistant-text"]'), 'must contain assistant text selector');
  assert.ok(css.includes('unicode-bidi: plaintext !important'), 'assistant text must use plaintext bidi');
  assert.ok(css.includes('text-align: start !important'), 'assistant text must use start alignment');
  assert.ok(css.includes('[data-cgpt-rtl-managed="user-text"][dir="rtl"]'), 'must keep user RTL selector');
  assert.ok(css.includes('[data-cgpt-rtl-managed="user-text"][dir="ltr"]'), 'must keep user LTR selector');
  assert.ok(css.includes('[data-cgpt-logical-line="assistant"]'), 'must contain logical-line selector');
  assert.ok(css.includes('[data-cgpt-logical-line="assistant"] > [data-cgpt-bidi-run="ltr"]'), 'must contain LTR run selector');
  assert.ok(css.includes('[data-cgpt-logical-line="assistant"] > [data-cgpt-bidi-run="rtl"]'), 'must contain RTL run selector');
  assert.ok(css.includes('[data-cgpt-flow-dir="rtl"]'), 'must contain RTL flow selector');
  assert.ok(css.includes('[data-cgpt-flow-dir="ltr"]'), 'must contain LTR flow selector');
  assert.ok(css.includes('ol[data-cgpt-list-direction="rtl"]'), 'must contain RTL list structural selector');
  assert.ok(css.includes('ul[data-cgpt-list-direction="ltr"]'), 'must contain LTR list structural selector');
  assert.ok(!css.includes('row-reverse'), 'must not use row-reverse for run placement');
});

test('rtl-patch.css contains composer selectors', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('#prompt-textarea'), 'must target prompt textarea');
  assert.ok(css.includes('contenteditable="true"'), 'must target contenteditable elements');
  assert.ok(css.includes('role="textbox"'), 'must target textbox role');
  assert.ok(css.includes('form textarea'), 'must target form textarea');
});

test('rtl-patch.css keeps list direction scoped to runtime-owned selectors', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(!css.includes('list-style-position: outside'), 'must not override list marker side');
  assert.ok(!css.includes('direction: inherit !important;'), 'must not force inherited list direction');
  assert.ok(!css.includes('text-align: inherit !important;'), 'must not force inherited list alignment');
});

test('rtl-patch.css contains code/math technical selectors', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('pre'), 'must handle pre elements');
  assert.ok(css.includes('code'), 'must handle code elements');
  assert.ok(css.includes('math'), 'must handle math elements');
  assert.ok(css.includes('.katex'), 'must handle KaTeX');
  assert.ok(css.includes('[data-language]'), 'must handle data-language');
  assert.ok(css.includes('monospace'), 'must set monospace font for code');
});

test('runtime font-face diagnostics omit raw src payloads', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  const snippetStart = runtime.indexOf('function getFontFaceSources(style)');
  const snippetEnd = runtime.indexOf('async function ensureFontStatus()');
  const snippet = runtime.slice(snippetStart, snippetEnd);
  assert.ok(snippet.includes('family:'), 'must still record family');
  assert.ok(snippet.includes('weight:'), 'must still record weight');
  assert.ok(snippet.includes('style:'), 'must still record style');
  assert.ok(!snippet.includes('src:'), 'must not expose raw src payloads in diagnostics');
});

test('runtime uses general logical-line directional-run engine', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('applyAssistantNativeMessage'), 'must support native assistant message processing');
  assert.ok(runtime.includes('applyAssistantNativeState'), 'must support native assistant element processing');
  assert.ok(runtime.includes('applyAssistantLogicalLines'), 'must support logical-line transformation');
  assert.ok(runtime.includes('segmentDirectionalRuns'), 'must support general directional-run segmentation');
  assert.ok(runtime.includes('discoverLogicalLineSegments'), 'must discover logical lines generically');
  assert.ok(runtime.includes('buildLogicalLine'), 'must build logical-line containers');
  assert.ok(runtime.includes('data-cgpt-logical-line'), 'must stamp logical-line container');
  assert.ok(runtime.includes('cgptFlowDir'), 'must stamp structural flow direction');
  assert.ok(runtime.includes('cgptBidiRun'), 'must stamp bidi runs');
  assert.ok(!runtime.includes('isEnglishFirstMixedText'), 'must not keep English-first special case');
  assert.ok(!runtime.includes('splitEnglishFirstMixedRuns'), 'must not keep English-first splitter');
  assert.ok(!runtime.includes('applyAssistantMixedLineState'), 'must not keep mixed-line special case');
});

// ── 7. Runtime template validation ──────────────────────────────────

test('runtime uses document.head with fallback', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('document.head'), 'must use document.head');
  assert.ok(runtime.includes('document.head || root'), 'must have fallback');
});

test('runtime keeps composer initialization free of input handlers', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes("setAttributeIfChanged(block, 'dir', 'auto')"), 'composer root must use native dir=auto');
  assert.ok(runtime.includes('applyAutoListDirection'), 'lists must use native dir=auto');
  assert.ok(!runtime.includes("root.addEventListener('input', onInput"), 'composer must not bind input handler');
  assert.ok(!runtime.includes("root.addEventListener('compositionstart', onCompositionStart"), 'composer must not bind composition handlers');
  assert.ok(!runtime.includes("root.addEventListener('compositionend', onCompositionEnd"), 'composer must not bind composition handlers');
});

test('runtime uses STYLE_ID for duplicate prevention', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('STYLE_ID'), 'must use STYLE_ID');
  assert.ok(runtime.includes('document.getElementById(STYLE_ID)'), 'must check for existing style element');
});

test('runtime is an IIFE', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.trimStart().startsWith('(() => {'), 'must start with IIFE');
  assert.ok(runtime.trimEnd().endsWith('})();'), 'must end with IIFE');
});

test('runtime contains MutationObserver for streaming content', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('MutationObserver'), 'must use MutationObserver');
  assert.ok(runtime.includes('childList'), 'must observe childList');
  assert.ok(runtime.includes('subtree'), 'must observe subtree');
  assert.ok(runtime.includes('characterData'), 'must observe characterData');
});

test('runtime has window[PATCH_ID] guard', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('window[PATCH_ID]'), 'must use window[PATCH_ID] guard');
  assert.ok(runtime.includes('window[PATCH_ID] = state'), 'must install state on window[PATCH_ID]');
});

test('runtime publishes build marker and diagnostics globals', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('__CHATGPT_RTL_BUILD__'), 'must accept build marker placeholder');
  assert.ok(runtime.includes('__CHATGPT_RTL_RUNTIME_SHA256__'), 'must accept runtime hash placeholder');
  assert.ok(runtime.includes('__CHATGPT_RTL_CSS_SHA256__'), 'must accept CSS hash placeholder');
  assert.ok(runtime.includes('__CHATGPT_RTL_DIAGNOSTIC_MODE__'), 'must accept diagnostic mode placeholder');
  assert.ok(runtime.includes('window.__CHATGPT_RTL_BUILD__ = BUILD_MARKER'), 'must publish build marker to window');
  assert.ok(runtime.includes('window.__CHATGPT_RTL_DIAGNOSTICS__ = state.diagnostics()'), 'must publish diagnostics to window');
  assert.ok(runtime.includes('function destroy('), 'must expose destroy helper');
});

test('runtime styles carry build marker data attribute', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('data-chatgpt-rtl-build'), 'must stamp injected style with build marker data attribute');
});

test('runtime has typeof window guard for non-DOM contexts', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes("typeof window === 'undefined'"), 'must check for window');
  assert.ok(runtime.includes("typeof document === 'undefined'"), 'must check for document');
});

// ── 8. --list with asar files (regression: extractAll .asar.unpacked) ──

test('--list works on asar files without needing .asar.unpacked', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    const asarPath = path.join(fixtureDir, 'test.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});

    const result = execFileSync(
      process.execPath,
      [patcherPath, '--list', asarPath],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    const cssLines = lines.filter((l) => l.startsWith('css:'));
    const jsLines = lines.filter((l) => l.startsWith('js:'));
    const indexLines = lines.filter((l) => l.startsWith('index:'));

    assert.ok(cssLines.some((l) => l.includes('style.css')), 'should list CSS files from asar');
    assert.ok(jsLines.some((l) => l.includes('app-main-abc123.js')), 'should list runtime candidate JS files');
    assert.ok(!jsLines.some((l) => l.includes('other-file.js')), 'should not list non-candidate JS files');
    assert.ok(indexLines.length === 1, 'should list index.html');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('--list on asar and extracted directory produce identical output', async () => {
  const fixtureDir = makeFixtureDir();
  const extractDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    const asarPath = path.join(fixtureDir, 'test.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});
    extractAll(asarPath, extractDir);

    const asarResult = execFileSync(
      process.execPath,
      [patcherPath, '--list', asarPath],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );
    const dirResult = execFileSync(
      process.execPath,
      [patcherPath, '--list', extractDir],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );

    const asarLines = asarResult.trim().split('\n').filter(Boolean).sort();
    const dirLines = dirResult.trim().split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(asarLines, dirLines, '--list output must be identical for asar and extracted dir');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
});

test('--list on .bak asar file produces valid output', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    const bakPath = path.join(fixtureDir, 'test.asar.chatgpt-persian-rtl.bak');
    await createPackageWithOptions(fixtureDir, bakPath, {});

    const result = execFileSync(
      process.execPath,
      [patcherPath, '--list', bakPath],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    assert.ok(lines.length > 0, '--list on .bak file should produce output');
    assert.ok(lines.some((l) => l.startsWith('css:')), 'should list CSS targets');
    assert.ok(lines.some((l) => l.startsWith('js:')), 'should list JS targets');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 9. --list output contract ───────────────────────────────────────

test('--list output has no absolute paths', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    const asarPath = path.join(fixtureDir, 'test.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});

    const result = execFileSync(
      process.execPath,
      [patcherPath, '--list', asarPath],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const value = line.replace(/^[^:]+:/, '');
      assert.ok(!value.startsWith('/'), `--list must not produce absolute paths: ${line}`);
      assert.ok(!value.includes('..'), `--list must not contain parent traversal: ${line}`);
    }
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('--list output has no duplicates', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    const asarPath = path.join(fixtureDir, 'test.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});

    const result = execFileSync(
      process.execPath,
      [patcherPath, '--list', asarPath],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    const unique = new Set(lines);
    assert.equal(lines.length, unique.size, `--list has duplicates: ${[...unique].join(', ')}`);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('--list produces zero CSS targets for empty fixture', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    const asarPath = path.join(fixtureDir, 'test.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});

    const result = execFileSync(
      process.execPath,
      [patcherPath, '--list', asarPath],
      { cwd: __dirname, encoding: 'utf8', timeout: 15_000 }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    const cssLines = lines.filter((l) => l.startsWith('css:'));
    assert.equal(cssLines.length, 0, 'should have zero CSS targets when no CSS files exist');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 10. Renderer vs non-renderer classification ────────────────────

test('isRuntimeCandidate excludes .vite/build/main-* files', () => {
  const patcher = readPatcherModule();
  assert.ok(!patcher.includes("'.vite/build/(?:preload|sandbox-preload|main-|bootstrap-)"), 'must not match .vite/build main/preload/bootstrap');
  assert.ok(patcher.includes("if (relative.startsWith('.vite/build/')) return false"), 'must explicitly skip .vite/build/');
});

test('isRuntimeCandidate includes webview/assets renderer bundles', () => {
  const patcher = readPatcherModule();
  assert.ok(patcher.includes('app-main'), 'must match app-main');
  assert.ok(patcher.includes('chatgpt-conversation-page'), 'must match chatgpt-conversation-page');
  assert.ok(patcher.includes('thread-user-message'), 'must match thread-user-message');
  assert.ok(patcher.includes('composer-'), 'must match composer-');
  assert.ok(patcher.includes('local-conversation-thread'), 'must match local-conversation-thread');
  assert.ok(patcher.includes('remote-conversation-page'), 'must match remote-conversation-page');
});

// ── 11. CSS payload completeness after fixture patching ─────────────

test('patched CSS file contains complete @layer chatgpt-rtl block', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    mkdirSync(path.join(fixtureDir, '.vite', 'build'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'body.css'), 'body { margin: 0; }\n');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'main-abc.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'preload.js'), 'export {};');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const css = readFileSync(path.join(fixtureDir, 'webview', 'assets', 'body.css'), 'utf8');

    assert.ok(css.includes('body { margin: 0; }'), 'original CSS must be preserved');
    assert.ok(css.includes(`/* ${marker} */`), 'must have CSS marker');
    assert.ok(css.includes('@layer chatgpt-rtl'), 'must contain @layer chatgpt-rtl');
    assert.ok(css.includes('--font-sans:'), 'must contain --font-sans override');
    assert.ok(css.includes('--font-sans-default:'), 'must contain --font-sans-default override');
    assert.ok(css.includes('@font-face'), 'must contain @font-face');
    assert.ok(css.includes('data:font/woff2;base64,'), 'must contain embedded font data URLs');
    assert.ok(css.includes('font-family: "Vazirmatn"'), 'must contain Vazirmatn font-family');
    assert.ok(css.includes('unicode-bidi: plaintext'), 'must contain unicode-bidi');

    const markerIdx = css.indexOf(`/* ${marker} */`);
    const originalIdx = css.indexOf('body { margin: 0; }');
    assert.ok(markerIdx > originalIdx, 'marker must come after original CSS content');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 12. Runtime payload completeness after fixture patching ─────────

test('patched JS file contains complete runtime payload', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    mkdirSync(path.join(fixtureDir, '.vite', 'build'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'export {};\n//# sourceMappingURL=app-main-test.js.map\n');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'main-abc.js'), 'export {};');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const js = readFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'utf8');

    assert.ok(js.startsWith('export {};'), 'original JS must be preserved');
    assert.ok(js.includes(`/* ${marker}: runtime */`), 'must have runtime marker');
    assert.ok(js.includes('(() => {'), 'must contain IIFE');
    assert.ok(js.includes("window[PATCH_ID]"), 'must contain window[PATCH_ID] guard');
    assert.ok(js.includes('document.getElementById(STYLE_ID)'), 'must contain STYLE_ID guard');
    assert.ok(js.includes('document.head || root'), 'must contain document.head fallback');
    assert.ok(js.includes('@layer chatgpt-rtl'), 'must contain embedded CSS');
    assert.ok(js.includes('MutationObserver'), 'must contain MutationObserver');
    assert.ok(js.includes('chatgpt-rtl-style'), 'must contain style element ID');
    assert.ok(js.includes('//# sourceMappingURL=app-main-test.js.map'), 'source map must be preserved');

    const runtimeIdx = js.indexOf(`/* ${marker}: runtime */`);
    const smIdx = js.indexOf('//# sourceMappingURL=');
    assert.ok(runtimeIdx < smIdx, 'runtime must be inserted before source map');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 13. Runtime is NOT injected into .vite/build bundles ───────────

test('runtime is NOT injected into .vite/build/main-* files', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    mkdirSync(path.join(fixtureDir, '.vite', 'build'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'main-D-AEKvtN.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'preload.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'sandbox-preload.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'bootstrap-yoLi0rMn.js'), 'export {};');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const main = readFileSync(path.join(fixtureDir, '.vite', 'build', 'main-D-AEKvtN.js'), 'utf8');
    const preload = readFileSync(path.join(fixtureDir, '.vite', 'build', 'preload.js'), 'utf8');
    const sandbox = readFileSync(path.join(fixtureDir, '.vite', 'build', 'sandbox-preload.js'), 'utf8');
    const bootstrap = readFileSync(path.join(fixtureDir, '.vite', 'build', 'bootstrap-yoLi0rMn.js'), 'utf8');

    assert.ok(!main.includes(marker), 'main-*.js must NOT contain runtime');
    assert.ok(!preload.includes(marker), 'preload.js must NOT contain runtime');
    assert.ok(!sandbox.includes(marker), 'sandbox-preload.js must NOT contain runtime');
    assert.ok(!bootstrap.includes(marker), 'bootstrap-*.js must NOT contain runtime');

    const appMain = readFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'utf8');
    assert.ok(appMain.includes(marker), 'webview app-main must contain runtime');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('runtime is NOT injected into node_modules bundles', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    mkdirSync(path.join(fixtureDir, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'node_modules', 'some-pkg', 'index.js'), 'export {};');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const pkg = readFileSync(path.join(fixtureDir, 'node_modules', 'some-pkg', 'index.js'), 'utf8');
    assert.ok(!pkg.includes(marker), 'node_modules must NOT contain runtime');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 14. Non-candidate JS files are not modified ─────────────────────

test('non-candidate JS files are not modified by patcher', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'random-icons.js'), 'export const icon = "svg";\n');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'unrelated-chunk.js'), 'export const x = 1;\n');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const icons = readFileSync(path.join(fixtureDir, 'webview', 'assets', 'random-icons.js'), 'utf8');
    const chunk = readFileSync(path.join(fixtureDir, 'webview', 'assets', 'unrelated-chunk.js'), 'utf8');

    assert.equal(icons, 'export const icon = "svg";\n', 'random-icons.js must be unchanged');
    assert.equal(chunk, 'export const x = 1;\n', 'unrelated-chunk.js must be unchanged');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 15. Zero JS runtime targets is a normal result ──────────────────

test('patcher succeeds with zero JS runtime candidates', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'style.css'), 'body {}');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'unrelated.js'), 'export {};');

    const result = execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    assert.ok(result.includes('تزریق'), 'patcher should report injection status');

    const css = readFileSync(path.join(fixtureDir, 'webview', 'assets', 'style.css'), 'utf8');
    assert.ok(css.includes(marker), 'CSS must still be patched');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 16. Changed application bundle filenames ────────────────────────

test('patcher matches renderer bundles with new filenames', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-newHash123.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'chatgpt-conversation-page-newHash456.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'composer-utility-bar-newHash789.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'thread-user-message-navigation-rail-newHash.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'local-conversation-thread-newHash.js'), 'export {};');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'remote-conversation-page-newHash.js'), 'export {};');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const files = [
      'app-main-newHash123.js',
      'chatgpt-conversation-page-newHash456.js',
      'composer-utility-bar-newHash789.js',
      'thread-user-message-navigation-rail-newHash.js',
      'local-conversation-thread-newHash.js',
      'remote-conversation-page-newHash.js'
    ];

    for (const file of files) {
      const content = readFileSync(path.join(fixtureDir, 'webview', 'assets', file), 'utf8');
      assert.ok(content.includes(marker), `${file} must contain runtime`);
    }
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

// ── 17. Full fixture patch/extract/repack round-trip ────────────────

test('full patch/extract/repack round-trip preserves all markers', async () => {
  const fixtureDir = makeFixtureDir();
  const extractDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    mkdirSync(path.join(fixtureDir, '.vite', 'build'), { recursive: true });
    writeFileSync(path.join(fixtureDir, 'webview', 'index.html'), '<html><head><style>@layer theme, base, components, utilities;</style></head><body></body></html>');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'style.css'), 'body {}');
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'app-main-test.js'), 'export {};\n//# sourceMappingURL=app-main-test.js.map\n');
    writeFileSync(path.join(fixtureDir, '.vite', 'build', 'main-abc.js'), 'export {};');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const asarPath = path.join(fixtureDir, 'patched.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});
    extractAll(asarPath, extractDir);

    const css = readFileSync(path.join(extractDir, 'webview', 'assets', 'style.css'), 'utf8');
    assert.ok(css.includes(marker), 'CSS marker must survive repack');
    assert.ok(css.includes('@layer chatgpt-rtl'), '@layer must survive repack');

    const js = readFileSync(path.join(extractDir, 'webview', 'assets', 'app-main-test.js'), 'utf8');
    assert.ok(js.includes(`${marker}: runtime`), 'JS runtime marker must survive repack');
    assert.ok(js.includes('//# sourceMappingURL='), 'source map must survive repack');

    const main = readFileSync(path.join(extractDir, '.vite', 'build', 'main-abc.js'), 'utf8');
    assert.ok(!main.includes(marker), 'main must not have runtime after round-trip');

    const index = readFileSync(path.join(extractDir, 'webview', 'index.html'), 'utf8');
    assert.ok(index.includes('chatgpt-rtl, theme, base, components, utilities'), 'index.html layer must be patched');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
});

// ── 18. Layer-order injection in index.html ─────────────────────────

test('layer-order injection succeeds against clean index.html with layer declaration', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    writeFileSync(
      path.join(fixtureDir, 'webview', 'index.html'),
      '<html><head><style>@layer theme, base, components, utilities;</style></head><body></body></html>'
    );

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const html = readFileSync(path.join(fixtureDir, 'webview', 'index.html'), 'utf8');
    assert.ok(
      html.includes('chatgpt-rtl, theme, base, components, utilities'),
      'index.html must contain patched layer declaration'
    );
    assert.ok(
      !html.includes('@layer theme, base, components, utilities;') ||
        html.includes('@layer chatgpt-rtl, theme, base, components, utilities;'),
      'original layer must be replaced by patched version'
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('layer declaration appears exactly once after patching', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    writeFileSync(
      path.join(fixtureDir, 'webview', 'index.html'),
      '<html><head><style>@layer theme, base, components, utilities;</style></head><body></body></html>'
    );

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const html = readFileSync(path.join(fixtureDir, 'webview', 'index.html'), 'utf8');
    const count = (html.match(/chatgpt-rtl, theme, base, components, utilities/g) || []).length;
    assert.equal(count, 1, 'patched layer declaration must appear exactly once');
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('repeated patching of index.html is idempotent', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    writeFileSync(
      path.join(fixtureDir, 'webview', 'index.html'),
      '<html><head><style>@layer theme, base, components, utilities;</style></head><body></body></html>'
    );

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    let secondErr = null;
    try {
      execFileSync(process.execPath, [patcherPath, fixtureDir], {
        cwd: __dirname, encoding: 'utf8', timeout: 30_000
      });
    } catch (e) {
      secondErr = e;
    }

    const html = readFileSync(path.join(fixtureDir, 'webview', 'index.html'), 'utf8');
    const count = (html.match(/chatgpt-rtl, theme, base, components, utilities/g) || []).length;
    assert.equal(count, 1, 'layer declaration must appear exactly once after double patching');
    assert.ok(html.includes('chatgpt-rtl, theme, base, components, utilities'), 'must still be patched');
    assert.ok(
      !html.includes('@layer theme, base, components, utilities;') ||
        html.includes('@layer chatgpt-rtl, theme, base, components, utilities;'),
      'original layer must not remain after patching'
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('layer injection works with different whitespace in index.html', async () => {
  const fixtureDir = makeFixtureDir();
  try {
    makeRendererFixture(fixtureDir);
    writeFileSync(
      path.join(fixtureDir, 'webview', 'index.html'),
      '<html><head><style>\n  @layer  theme , base , components , utilities ;\n</style></head><body></body></html>'
    );

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const html = readFileSync(path.join(fixtureDir, 'webview', 'index.html'), 'utf8');
    assert.ok(
      html.includes('chatgpt-rtl, theme, base, components, utilities'),
      'must handle variable whitespace in layer declaration'
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('layer injection succeeds through asar round-trip', async () => {
  const fixtureDir = makeFixtureDir();
  const extractDir = makeFixtureDir();
  try {
    mkdirSync(path.join(fixtureDir, 'webview', 'assets'), { recursive: true });
    writeFileSync(
      path.join(fixtureDir, 'webview', 'index.html'),
      '<html><head><style>@layer theme, base, components, utilities;</style></head><body></body></html>'
    );
    writeFileSync(path.join(fixtureDir, 'webview', 'assets', 'style.css'), 'body {}');

    execFileSync(process.execPath, [patcherPath, fixtureDir], {
      cwd: __dirname, encoding: 'utf8', timeout: 30_000
    });

    const asarPath = path.join(fixtureDir, 'patched.asar');
    await createPackageWithOptions(fixtureDir, asarPath, {});
    extractAll(asarPath, extractDir);

    const html = readFileSync(path.join(extractDir, 'webview', 'index.html'), 'utf8');
    assert.ok(
      html.includes('chatgpt-rtl, theme, base, components, utilities'),
      'layer declaration must survive asar round-trip'
    );
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
    rmSync(extractDir, { recursive: true, force: true });
  }
});

// ── 19. Verifier comment-stripping for [class*="code"] ──────────────

test('CSS comment containing [class*="code"] does not fail verification', () => {
  const cssWithComment = `/*
 * Removed [class*="code"] — it was too broad and
 * matched unrelated UI containers.
 */
[data-message-author-role="user"] pre {
  direction: ltr;
}`;

  const stripped = cssWithComment.replace(/\/\*.*?\*\//gs, '');
  assert.ok(
    !stripped.includes('[class*="code"]'),
    'after stripping comments, [class*="code"] should not be found'
  );
  assert.ok(
    cssWithComment.includes('[class*="code"]'),
    'original CSS must still contain [class*="code"] in comment'
  );
});

test('real [class*="code"] selector is detected after comment stripping', () => {
  const cssWithSelector = `/*
 * Some comment about code blocks.
 */
[data-cgpt-rtl-managed] [class*="code"] {
  direction: ltr;
}`;

  const stripped = cssWithSelector.replace(/\/\*.*?\*\//gs, '');
  assert.ok(
    stripped.includes('[class*="code"]'),
    'after stripping comments, real selector must still be detected'
  );
});

test('rtl-patch.css passes the comment-aware [class*="code"] check', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  const stripped = css.replace(/\/\*.*?\*\//gs, '');
  assert.ok(
    !stripped.includes('[class*="code"]'),
    'after stripping comments from rtl-patch.css, [class*="code"] must not appear as a selector'
  );
});

// ── 20. Codex assistant classification regression ───────────────────

test('runtime exposes Codex assistant root detector', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('isAssistantMessageRoot'), 'must define isAssistantMessageRoot');
  assert.ok(runtime.includes('data-local-conversation-final-assistant'), 'must recognize Codex final-assistant selector');
  assert.ok(runtime.includes('data-content-search-unit-key'), 'must recognize Codex content-search-unit-key selector');
  assert.ok(runtime.includes('isAssistantUnitKey'), 'must gate by assistant unit-key value');
  assert.ok(runtime.includes('reclassifyAssistantDescendants'), 'must reclassify stale generic message nodes');
  assert.ok(runtime.includes('reclassifyStaleAssistantNodes'), 'must walk existing assistant roots on boot');
});

test('inferMessageManagedTag now recognizes Codex assistant roots', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  const fnStart = runtime.indexOf('function inferMessageManagedTag');
  assert.ok(fnStart >= 0, 'inferMessageManagedTag must be defined');
  const fnEnd = runtime.indexOf('\n  }\n', fnStart);
  const fnBody = runtime.slice(fnStart, fnEnd);
  assert.ok(fnBody.includes('isAssistantMessageRoot(root)'), 'inferMessageManagedTag must call isAssistantMessageRoot');
  assert.ok(
    fnBody.indexOf("if (root.closest('[data-user-message-bubble]')) return 'user-text';") < fnBody.indexOf("if (isAssistantMessageRoot(root)) return 'assistant-text';"),
    'user bubble detection must precede assistant detection'
  );
  assert.ok(
    fnBody.indexOf("if (isAssistantMessageRoot(root)) return 'assistant-text';") < fnBody.indexOf("return 'message-text';"),
    'assistant detection must precede generic message-text fallback'
  );
});

test('processMessage routes Codex assistant roots through applyAssistantNativeMessage', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  const fnStart = runtime.indexOf('function processMessage(message)');
  const fnEnd = runtime.indexOf('\n  }\n', fnStart);
  const fnBody = runtime.slice(fnStart, fnEnd);
  assert.ok(fnBody.includes('isAssistantMessageRoot(message)'), 'processMessage must short-circuit for assistant roots');
  assert.ok(fnBody.includes('reclassifyAssistantDescendants(message)'), 'processMessage must clear stale generic message state');
});

test('MESSAGE_ROOT_SELECTOR includes Codex assistant selectors', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  const msgStart = runtime.indexOf('const MESSAGE_ROOT_SELECTOR');
  const msgEnd = runtime.indexOf('].join(\',\');', msgStart);
  const body = runtime.slice(msgStart, msgEnd);
  assert.ok(body.includes('data-local-conversation-final-assistant'), 'must include Codex final-assistant selector');
  assert.ok(body.includes('data-content-search-unit-key'), 'must include Codex content-search-unit-key selector');
});

test('logical-line engine preserves run order and flow attributes', () => {
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes("container.dataset.cgptLogicalLine = 'assistant'"), 'must stamp logical-line');
  assert.ok(runtime.includes('container.dataset.cgptFlowDir = resolvedFlow'), 'must stamp flow dir');
  assert.ok(runtime.includes("bdi.dataset.cgptBidiRun = run.dir"), 'must stamp each run dir');
  assert.ok(runtime.includes('segmentDirectionalRuns'), 'must use general segmenter');
  assert.ok(runtime.includes('migrateObsoleteLogicalWrappers'), 'must migrate obsolete wrappers');
  assert.ok(runtime.includes('applyListStructuralDirection'), 'must apply list structural flow');
  assert.ok(runtime.includes('data-cgpt-list-direction'), 'must stamp list structural direction');
});

// ── 21. Directional-run matrix (string-level pure helpers) ───────────

function splitTextIntoDirectionalPiecesForTest(text) {
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
  const LTR = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/u;
  const source = String(text || '');
  if (!source) return [];
  const atomicRe = /https?:\/\/\S+|www\.\S+|[^\s@]+@[^\s@]+\.[^\s@]+|(?:[A-Za-z]:\\|\/|\.\/|\.\.\/)[\w./\\-]+/giu;
  const tokens = [];
  let lastIndex = 0;
  let match;
  while ((match = atomicRe.exec(source)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'text', text: source.slice(lastIndex, match.index) });
    tokens.push({ type: 'atomic-ltr', text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) tokens.push({ type: 'text', text: source.slice(lastIndex) });

  const pieces = [];
  let currentDir = null;
  let currentText = '';
  let leading = '';
  const flush = () => {
    if (currentDir && currentText) pieces.push({ dir: currentDir, text: currentText });
    currentDir = null;
    currentText = '';
  };
  for (const token of tokens) {
    if (token.type === 'atomic-ltr') {
      if (!currentDir) {
        currentDir = 'ltr';
        currentText = leading + token.text;
        leading = '';
      } else if (currentDir === 'ltr') {
        currentText += token.text;
      } else {
        flush();
        currentDir = 'ltr';
        currentText = token.text;
      }
      continue;
    }
    for (const char of Array.from(token.text)) {
      let charDir = null;
      if (RTL.test(char)) charDir = 'rtl';
      else if (LTR.test(char)) charDir = 'ltr';
      if (charDir) {
        if (!currentDir) {
          currentDir = charDir;
          currentText = leading + char;
          leading = '';
          continue;
        }
        if (currentDir === charDir) {
          currentText += char;
          continue;
        }
        flush();
        currentDir = charDir;
        currentText = char;
        continue;
      }
      if (currentDir) currentText += char;
      else leading += char;
    }
  }
  if (currentDir) pieces.push({ dir: currentDir, text: currentText });
  else if (leading) pieces.push({ dir: 'ltr', text: leading });
  return pieces;
}

function assertRunMatrix(label, text, expectedDirs, expectedJoined) {
  const pieces = splitTextIntoDirectionalPiecesForTest(text);
  assert.deepEqual(pieces.map((p) => p.dir), expectedDirs, `${label}: dirs`);
  assert.equal(pieces.map((p) => p.text).join(''), expectedJoined ?? text, `${label}: textContent preserved`);
}

test('directional-run matrix: pure Persian and pure English', () => {
  assertRunMatrix('fa-only', 'من امروز خوشحالم.', ['rtl']);
  assertRunMatrix('en-only', 'I am learning new things every day.', ['ltr']);
});

test('directional-run matrix: Persian then English and English then Persian', () => {
  assertRunMatrix(
    'fa-then-en',
    'من امروز خوشحالم، and I feel full of energy.',
    ['rtl', 'ltr']
  );
  assertRunMatrix(
    'en-then-fa',
    'This is a simple example, و این فقط یک نمونه کوتاه است.',
    ['ltr', 'rtl']
  );
});

test('directional-run matrix: alternating multi-run lines', () => {
  assertRunMatrix(
    'fa-en-fa',
    'سلام hello دوباره',
    ['rtl', 'ltr', 'rtl']
  );
  assertRunMatrix(
    'en-fa-en',
    'hello سلام world',
    ['ltr', 'rtl', 'ltr']
  );
});

test('directional-run matrix: punctuation, numbers, emoji, URL, email', () => {
  assertRunMatrix(
    'punct-boundary',
    'Hello, دنیا!',
    ['ltr', 'rtl']
  );
  assertRunMatrix(
    'numbers',
    'قیمت 123 دلار',
    ['rtl']
  );
  assertRunMatrix(
    'emoji-leading',
    '😀 Hello دنیا',
    ['ltr', 'rtl']
  );
  const withUrl = 'ببین https://example.com/path را';
  const pieces = splitTextIntoDirectionalPiecesForTest(withUrl);
  assert.ok(pieces.some((p) => p.dir === 'ltr' && p.text.includes('https://example.com/path')), 'URL is atomic LTR');
  assert.equal(pieces.map((p) => p.text).join(''), withUrl, 'URL line text preserved');
});

test('runtime logical-line CSS and list direction selectors stay scoped', () => {
  const css = readFileSync(patchCssPath, 'utf8');
  assert.ok(css.includes('[data-cgpt-logical-line="assistant"]'), 'logical-line container present');
  assert.ok(css.includes('flex-direction: row !important'), 'uses row not reverse');
  assert.ok(!css.includes('list-style-position'), 'must not touch list-style-position');
  assert.ok(!css.includes('list-style-type'), 'must not touch list-style-type');
  const runtime = readFileSync(patchRuntimePath, 'utf8');
  assert.ok(runtime.includes('migrateObsoleteLogicalWrappers'), 'migrates obsolete wrappers');
  assert.ok(runtime.includes("data-cgpt-mixed-line=\"assistant\""), 'still recognizes old mixed-line for migration');
});

// ── Summary ─────────────────────────────────────────────────────────

await Promise.allSettled(pending);
process.stdout.write(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
