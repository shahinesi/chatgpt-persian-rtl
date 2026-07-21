import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(manifest.version === '1.0.0', 'manifest and package versions must be synchronized');
assert(JSON.stringify(manifest.permissions) === JSON.stringify(['storage']), 'Only storage permission is allowed');

const expectedMatches = ['https://chatgpt.com/*', 'https://chat.openai.com/*'];
const actualMatches = manifest.content_scripts?.[0]?.matches ?? [];
assert(JSON.stringify(actualMatches) === JSON.stringify(expectedMatches), 'Host matches must stay limited to official ChatGPT domains');

const requiredFiles = [
  'content.js',
  'styles.css',
  'popup.html',
  'popup.js',
  'fonts/Vazirmatn-Regular.ttf',
  'fonts/Vazirmatn-Bold.ttf',
  'fonts/NOTICE.txt',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

for (const file of requiredFiles) await access(path.join(root, file));

const content = await readFile(path.join(root, 'content.js'), 'utf8');
for (const forbidden of ['eval(', 'new Function(', 'fetch(', 'XMLHttpRequest']) {
  assert(!content.includes(forbidden), `Forbidden runtime capability detected: ${forbidden}`);
}

const css = await readFile(path.join(root, 'styles.css'), 'utf8');
for (const forbiddenSelector of [/^\s*html\b/m, /^\s*body\b/m, /^\s*main\b/m]) {
  assert(!forbiddenSelector.test(css), `Global selector is forbidden: ${forbiddenSelector}`);
}

console.log('Validation passed: MV3, minimal permissions, scoped domains and required files.');
