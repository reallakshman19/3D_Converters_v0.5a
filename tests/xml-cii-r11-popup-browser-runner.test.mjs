import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const path = new URL('./xml-cii-workflow-popup-browser.mjs', import.meta.url);

test('R11 D3 fresh profile selects xml_to_cii before looking for workflow launcher', async () => {
  const src = await readFile(path, 'utf8');
  const selectPos = src.indexOf("converterSelect.value = 'xml_to_cii'");
  const launchPos = src.indexOf("await waitFor(() => !!host.querySelector('#model-converters-xml-cii-workflow-btn')");
  assert.ok(selectPos > 0 && launchPos > selectPos,
    'removing converter selection must make this test RED');
  assert.match(src, /converterSelect\.dispatchEvent\(new Event\('change'/);
});

test('R11 D3 Windows Chrome profile cleanup waits for exit and retries EBUSY', async () => {
  const src = await readFile(path, 'utf8');
  assert.match(src, /chrome\.once\('exit', settled\)/);
  assert.match(src, /'EBUSY', 'EPERM', 'ENOTEMPTY'/);
  assert.match(src, /await rm\(profile, \{ recursive: true, force: true, maxRetries: 2/);
});
