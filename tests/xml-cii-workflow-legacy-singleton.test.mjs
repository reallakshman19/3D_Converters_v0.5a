import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const roots = ['tabs', 'core', 'converters'];
const required = [
  'tabs/model-converters-tab.js',
  'tabs/model-converters/ModelConvertersTab.js',
  'tabs/model-converters/xml-cii-workflow-bridge.js',
];
const expectedVersion = '20260816-cii-v11-v14-dropdown-release-4';

async function visit(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        found.push(...await visit(join(dir, entry.name)));
      }
    } else if (/\.m?js$/i.test(entry.name)) found.push(join(dir, entry.name));
  }
  return found;
}

test('D1: all production imports resolve to one canonical legacy-adapter.js module URL', async () => {
  const files = (await Promise.all(roots.map((root) => visit(join(repoRoot, root))))).flat();
  const imports = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    // Includes literal dynamic-import paths and the tab shim LEGACY_MODULE.
    for (const match of source.matchAll(/['"]([^'"\n]*legacy-adapter\.js(?:\?[^'"\n]*)?)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = new URL(specifier, pathToFileURL(file)).href;
      imports.push({ file: relative(repoRoot, file).replaceAll('\\', '/'), specifier, resolved });
    }
  }
  for (const file of required) {
    assert.ok(imports.some((item) => item.file === file), 'missing legacy module import: ' + file);
  }
  assert.ok(imports.length >= 3, 'expected all three live importers');
  const urls = new Set(imports.map((item) => item.resolved));
  assert.equal(urls.size, 1, 'legacy adapter imports must be one URL, not duplicated modules:\n' +
    imports.map(({ file, specifier }) => file + ' -> ' + specifier).join('\n'));
  const [onlyUrl] = urls;
  assert.equal(new URL(onlyUrl).searchParams.get('v'), expectedVersion);
});
